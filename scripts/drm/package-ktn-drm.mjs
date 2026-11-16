#!/usr/bin/env node
/**
 * KTN Offline Multi-DRM Video Packaging Pipeline (FFmpeg 8-bit H.264/AAC + Shaka Packager CMAF)
 *
 * Rules:
 * - Heavy transcoding & encryption NEVER run inside Cloudflare Worker.
 * - Preserves original izTeach HLS manifests untouched for instant rollback (`drmDisabled`).
 * - NEVER emits ClearKey or public test PlayReady/Widevine URLs as production manifests.
 * - Fails with exit code 2 (`BLOCKED`) on `--execute` if `packager` or real KMS keys/credentials are missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_WIN_FFMPEG_DIR = 'D:\\Tools\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin';
const PUBLIC_TEST_PATTERNS = [
  /test\.playready\.microsoft\.com/i,
  /proxy\.uat\.widevine\.com/i,
  /cwip-shaka-proxy\.appspot\.com/i,
  /fps\.ezdrm\.com\/demo/i,
  /fps\.ezdrm\.com\/api\/licenses\/09cc0377-6dd4-40cb-b09d-b582236e70fe/i,
];

export function parseArgs(argv) {
  const args = {
    videoId: '',
    unitId: '',
    input: '',
    outputDir: '',
    scheme: 'cbcs',
    execute: false,
    dryRun: true,
    json: false,
    keyIdHex: '',
    keyHex: '',
    ivHex: '',
    fairplayKeyUri: '',
    psshHex: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const next = argv[i + 1];
    switch (token) {
      case '--video-id':
        args.videoId = String(next || '').trim();
        i++;
        break;
      case '--unit-id':
        args.unitId = String(next || '').trim();
        i++;
        break;
      case '--input':
        args.input = String(next || '').trim();
        i++;
        break;
      case '--out':
      case '--output-dir':
        args.outputDir = String(next || '').trim();
        i++;
        break;
      case '--scheme':
        args.scheme = String(next || 'cbcs').trim().toLowerCase();
        i++;
        break;
      case '--key-id':
        args.keyIdHex = String(next || '').trim().toLowerCase().replace(/-/g, '');
        i++;
        break;
      case '--key':
        args.keyHex = String(next || '').trim().toLowerCase();
        i++;
        break;
      case '--iv':
        args.ivHex = String(next || '').trim().toLowerCase();
        i++;
        break;
      case '--fairplay-uri':
        args.fairplayKeyUri = String(next || '').trim();
        i++;
        break;
      case '--pssh':
        args.psshHex = String(next || '').trim().toLowerCase();
        i++;
        break;
      case '--execute':
        args.execute = true;
        args.dryRun = false;
        break;
      case '--dry-run':
        args.dryRun = true;
        args.execute = false;
        break;
      case '--json':
        args.json = true;
        break;
      default:
        break;
    }
  }

  return args;
}

export function resolveToolBinary(name) {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(path.join(DEFAULT_WIN_FFMPEG_DIR, `${name}.exe`));
    candidates.push(`${name}.exe`);
  }
  candidates.push(name);

  for (const bin of candidates) {
    if (path.isAbsolute(bin)) {
      if (fs.existsSync(bin)) return bin;
      continue;
    }
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const out = execFileSync(cmd, [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean);
      if (out) return out;
    } catch {
      // ignore missing binary in PATH
    }
  }
  return null;
}

export function probeSourceMedia(ffprobeBin, inputPathOrUrl) {
  if (!ffprobeBin || !inputPathOrUrl) return null;
  try {
    const raw = execFileSync(
      ffprobeBin,
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        inputPathOrUrl,
      ],
      { encoding: 'utf8', timeout: 20000 }
    );
    const parsed = JSON.parse(raw);
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const videoStreams = streams.filter((s) => s.codec_type === 'video');
    const sortedVideos = [...videoStreams].sort(
      (a, b) => Number(b.height || 0) - Number(a.height || 0)
    );
    const videoStream = sortedVideos[0] || null;
    const audioStream = streams.find((s) => s.codec_type === 'audio') || null;
    const any10Bit = videoStreams.some(
      (v) => /10le|10be/i.test(String(v?.pix_fmt || '')) || /High 10/i.test(String(v?.profile || ''))
    );
    const pixFmt = String(videoStream?.pix_fmt || '');
    const profile = String(videoStream?.profile || '');
    const is10Bit = any10Bit || /10le|10be/i.test(pixFmt) || /High 10/i.test(profile);
    return {
      formatName: parsed.format?.format_name || null,
      durationSec: parsed.format?.duration ? Number(parsed.format.duration) : null,
      videoVariantsCount: videoStreams.length,
      video: videoStream
        ? {
            codec: videoStream.codec_name,
            profile,
            level: videoStream.level,
            pixFmt,
            width: videoStream.width,
            height: videoStream.height,
            rFrameRate: videoStream.r_frame_rate,
            is10Bit,
            requires8BitTranscodeForHardwareDrm: is10Bit || videoStream.codec_name !== 'h264',
          }
        : null,
      audio: audioStream
        ? {
            codec: audioStream.codec_name,
            profile: audioStream.profile,
            channels: audioStream.channels,
            sampleRate: Number(audioStream.sample_rate || 0),
          }
        : null,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function buildFfmpeg8BitArgs(inputPathOrUrl, workDir) {
  const dir = workDir || './drm-work';
  const v720 = path.join(dir, 'v720_h264_8bit.mp4');
  const v480 = path.join(dir, 'v480_h264_8bit.mp4');
  const a128 = path.join(dir, 'a128_aac.mp4');

  // Force 8-bit yuv420p + aligned closed-GOP IDR cadence (2s @ 30fps or 60fps -> keyframe every 2s)
  // Audio normalized to stereo AAC-LC 44100Hz for Apple FairPlay + Widevine/PlayReady CMAF parity.
  return {
    v720,
    v480,
    a128,
    commands: [
      {
        label: '720p_8bit_h264_cmaf',
        args: [
          '-y',
          '-i',
          inputPathOrUrl,
          '-an',
          '-vf',
          'scale=-2:720,format=yuv420p',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-profile:v',
          'high',
          '-level:v',
          '4.0',
          '-r',
          '30',
          '-g',
          '60',
          '-keyint_min',
          '60',
          '-sc_threshold',
          '0',
          '-b:v',
          '1800k',
          '-maxrate',
          '2200k',
          '-bufsize',
          '3600k',
          '-movflags',
          '+faststart',
          v720,
        ],
      },
      {
        label: '480p_8bit_h264_cmaf',
        args: [
          '-y',
          '-i',
          inputPathOrUrl,
          '-an',
          '-vf',
          'scale=-2:480,format=yuv420p',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-profile:v',
          'main',
          '-level:v',
          '3.1',
          '-r',
          '30',
          '-g',
          '60',
          '-keyint_min',
          '60',
          '-sc_threshold',
          '0',
          '-b:v',
          '900k',
          '-maxrate',
          '1100k',
          '-bufsize',
          '1800k',
          '-movflags',
          '+faststart',
          v480,
        ],
      },
      {
        label: 'audio_aac_lc_cmaf',
        args: [
          '-y',
          '-i',
          inputPathOrUrl,
          '-vn',
          '-c:a',
          'aac',
          '-ac',
          '2',
          '-ar',
          '44100',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          a128,
        ],
      },
    ],
  };
}

function toPosixPath(p) {
  return String(p || '').replace(/\\/g, '/');
}

export function buildShakaPackagerArgs({
  v720,
  v480,
  a128,
  outDir,
  scheme = 'cbcs',
  keyIdHex,
  keyHex,
  ivHex,
  fairplayKeyUri,
  psshHex,
}) {
  const effectiveScheme = scheme === 'cenc' ? 'cenc' : 'cbcs';
  const normOutDir = toPosixPath(outDir);
  const mpdOut = toPosixPath(path.join(outDir, 'manifest.mpd'));
  const hlsOut = toPosixPath(path.join(outDir, 'master.m3u8'));

  const args = [
    `in=${toPosixPath(v720)},stream=video,init_segment=${normOutDir}/v720/init.mp4,segment_template=${normOutDir}/v720/$Number$.m4s,playlist_name=v720.m3u8,iframe_playlist_name=v720_iframe.m3u8`,
    `in=${toPosixPath(v480)},stream=video,init_segment=${normOutDir}/v480/init.mp4,segment_template=${normOutDir}/v480/$Number$.m4s,playlist_name=v480.m3u8,iframe_playlist_name=v480_iframe.m3u8`,
    `in=${toPosixPath(a128)},stream=audio,init_segment=${normOutDir}/audio/init.mp4,segment_template=${normOutDir}/audio/$Number$.m4s,playlist_name=audio.m3u8,hls_group_id=audio,hls_name=VI`,
    '--protection_scheme',
    effectiveScheme,
    '--enable_raw_key_encryption',
    '--keys',
    `label=:key_id=${keyIdHex || '<KMS_KEY_ID_32_HEX>'}:key=${keyHex || '<KMS_CONTENT_KEY_32_HEX>'}${
      ivHex ? `:iv=${ivHex}` : ''
    }`,
    '--protection_systems',
    effectiveScheme === 'cbcs' ? 'FairPlay,Widevine,PlayReady' : 'Widevine,PlayReady',
    '--segment_duration',
    '4',
    '--fragment_duration',
    '4',
    '--mpd_output',
    mpdOut,
    '--hls_master_playlist_output',
    hlsOut,
  ];

  if (effectiveScheme === 'cbcs' && fairplayKeyUri) {
    args.push('--hls_key_uri', fairplayKeyUri);
  }

  if (psshHex) {
    args.push('--pssh', psshHex);
  }

  return {
    scheme: effectiveScheme,
    outDir: normOutDir,
    mpdOut,
    hlsOut,
    args,
  };
}

export function validateProductionPackagingReadiness({ args, env, packagerBin, ffmpegBin }) {
  const blockers = [];

  if (!ffmpegBin) {
    blockers.push('MISSING_FFMPEG_BINARY');
  }
  if (!packagerBin) {
    blockers.push('MISSING_SHAKA_PACKAGER_BINARY (install Google shaka-packager CLI)');
  }

  const wvProxy = String(env.KTN_DRM_WIDEVINE_PROXY_URL || '').trim();
  const prProxy = String(env.KTN_DRM_PLAYREADY_PROXY_URL || '').trim();
  const fpProxy = String(env.KTN_DRM_FAIRPLAY_PROXY_URL || '').trim();
  const anyProxyConfigured = Boolean(wvProxy || prProxy || fpProxy);

  if (!anyProxyConfigured) {
    blockers.push(
      'MISSING_COMMERCIAL_DRM_LICENSE_CREDENTIALS (set KTN_DRM_WIDEVINE_PROXY_URL / KTN_DRM_PLAYREADY_PROXY_URL / KTN_DRM_FAIRPLAY_PROXY_URL)'
    );
  }

  for (const url of [wvProxy, prProxy, fpProxy]) {
    if (url && PUBLIC_TEST_PATTERNS.some((re) => re.test(url))) {
      blockers.push(`FORBIDDEN_PUBLIC_TEST_LICENSE_URL: ${url}`);
    }
  }

  if (args.execute && (!/^[0-9a-f]{32}$/.test(args.keyIdHex) || !/^[0-9a-f]{32}$/.test(args.keyHex))) {
    blockers.push(
      'MISSING_PRODUCTION_CONTENT_KEY (--key-id and --key 32-hex from SPEKE/KMS are required for --execute; ClearKey fallback is forbidden)'
    );
  }

  if (
    args.execute &&
    (args.scheme === 'cbcs' || args.scheme === 'dual') &&
    !String(args.fairplayKeyUri || '').trim()
  ) {
    blockers.push(
      'MISSING_FAIRPLAY_SKD_KEY_URI (--fairplay-uri skd://... is required when packaging FairPlay cbcs streams)'
    );
  }

  return {
    status: blockers.length === 0 ? 'READY' : 'BLOCKED',
    blockers,
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const ffmpegBin = resolveToolBinary('ffmpeg');
  const ffprobeBin = resolveToolBinary('ffprobe');
  const packagerBin = resolveToolBinary('packager') || resolveToolBinary('shaka-packager');

  const inputSource =
    args.input ||
    (args.videoId
      ? `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/${args.videoId}/playlist.m3u8`
      : 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/<videoId>/playlist.m3u8');

  const outDir = path.resolve(
    args.outputDir || path.join('dist-drm-pilot', args.videoId || 'sample-unit')
  );
  const workDir = path.join(outDir, '_transcode_tmp');

  const readiness = validateProductionPackagingReadiness({
    args,
    env: process.env,
    packagerBin,
    ffmpegBin,
  });

  const probe = args.input ? probeSourceMedia(ffprobeBin, args.input) : null;
  const transcodePlan = buildFfmpeg8BitArgs(inputSource, workDir);
  const targetSchemes = args.scheme === 'dual' ? ['cbcs', 'cenc'] : [args.scheme === 'cenc' ? 'cenc' : 'cbcs'];
  const packagerPlans = targetSchemes.map((sch) =>
    buildShakaPackagerArgs({
      v720: transcodePlan.v720,
      v480: transcodePlan.v480,
      a128: transcodePlan.a128,
      outDir: targetSchemes.length > 1 ? path.join(outDir, sch) : outDir,
      scheme: sch,
      keyIdHex: args.keyIdHex,
      keyHex: args.keyHex,
      ivHex: args.ivHex,
      fairplayKeyUri: args.fairplayKeyUri,
      psshHex: args.psshHex,
    })
  );
  const packagerPlan = packagerPlans[0];

  if (args.execute && readiness.status !== 'READY') {
    const blockedReport = {
      ok: false,
      status: 'BLOCKED',
      reason: 'Production Multi-DRM packaging cannot execute without packager + KMS keys.',
      blockers: readiness.blockers,
      rollbackPreserved: true,
    };
    console.error(JSON.stringify(blockedReport, null, 2));
    process.exitCode = 2;
    return blockedReport;
  }

  if (args.execute && readiness.status === 'READY') {
    fs.mkdirSync(workDir, { recursive: true });
    for (const step of transcodePlan.commands) {
      execFileSync(ffmpegBin, step.args, { stdio: 'inherit' });
    }
    for (const plan of packagerPlans) {
      for (const sub of ['v720', 'v480', 'audio']) {
        fs.mkdirSync(path.join(plan.outDir, sub), { recursive: true });
      }
      execFileSync(packagerBin, plan.args, { stdio: 'inherit' });
    }
  }

  const planReport = {
    ok: readiness.status === 'READY',
    mode: args.execute ? 'EXECUTE' : 'DRY_RUN_PLAN',
    status: readiness.status,
    unitId: args.unitId || null,
    videoId: args.videoId || null,
    tools: {
      ffmpeg: ffmpegBin,
      ffprobe: ffprobeBin,
      packager: packagerBin,
    },
    blockers: readiness.blockers,
    sourceProbe: probe,
    noteOnIzTeachCodec:
      'Verified izTeach source HLS streams encode High 10 (yuv420p10le). Offline 8-bit yuv420p H.264 re-encode is mandatory before Shaka Packager for hardware FairPlay/Widevine L1/PlayReady SL3000 playback.',
    transcodePlan,
    packagerPlan,
    ...(packagerPlans.length > 1 ? { packagerPlans } : {}),
    rollbackNote:
      'Legacy izTeach HLS master/media playlists remain untouched. Switching course DRM policy back to drmDisabled reverts instantly.',
  };

  console.log(JSON.stringify(planReport, null, 2));
  return planReport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
