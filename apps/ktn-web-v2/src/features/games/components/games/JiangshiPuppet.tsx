import React, { useEffect, useRef } from 'react';

export const HOP_PERIOD_SEC = 0.76;
export const LANE_PHASE_OFFSETS = [0, 0.27, 0.53] as const;

export interface JiangshiPose {
  phase: number;
  strideMultiplier: number;
  hopY: number;
  squashX: number;
  squashY: number;
  bodyTiltDeg: number;
  frontArmDeg: number;
  backArmDeg: number;
  frontLegDeg: number;
  backLegDeg: number;
  talismanDeg: number;
  tasselDeg: number;
  headNodDeg: number;
  shadowScale: number;
  shadowOpacity: number;
  dustOpacity: number;
  dustX: number;
  dustY: number;
  dustScale: number;
  blinkScaleY: number;
  scrollBobY: number;
}

export interface JiangshiPartHandles {
  hopper: HTMLDivElement | null;
  shadow: HTMLDivElement | null;
  dust: HTMLDivElement | null;
  backArm: HTMLDivElement | null;
  frontArm: HTMLDivElement | null;
  backLeg: HTMLDivElement | null;
  frontLeg: HTMLDivElement | null;
  head: HTMLDivElement | null;
  talisman: HTMLDivElement | null;
  tassel: HTMLDivElement | null;
  eyelid: HTMLDivElement | null;
  scrollWrap: HTMLDivElement | null;
}

export function computeJiangshiKinematics(
  elapsedSec: number,
  laneIndex: number,
  reducedMotion = false
): JiangshiPose {
  const safeLane = ((laneIndex % 3) + 3) % 3;
  const offset = LANE_PHASE_OFFSETS[safeLane];
  const phase = ((((elapsedSec + offset) / HOP_PERIOD_SEC) % 1) + 1) % 1;

  if (reducedMotion) {
    return {
      phase,
      strideMultiplier: 1,
      hopY: 0,
      squashX: 1,
      squashY: 1,
      bodyTiltDeg: 0,
      frontArmDeg: 0,
      backArmDeg: 0,
      frontLegDeg: 0,
      backLegDeg: 0,
      talismanDeg: 0,
      tasselDeg: 0,
      headNodDeg: 0,
      shadowScale: 1,
      shadowOpacity: 0.34,
      dustOpacity: 0,
      dustX: 0,
      dustY: 0,
      dustScale: 0.75,
      blinkScaleY: 1,
      scrollBobY: 0,
    };
  }

  // Average over [0, 1) equals exactly 1.000 so average speed stays unchanged
  const strideMultiplier = 0.28 + 0.72 * (1 - Math.cos(2 * Math.PI * phase));
  const isGround = phase < 0.18 || phase > 0.86;
  const flutterWave = Math.sin(2 * Math.PI * (phase - 0.2));
  const tasselWave = Math.sin(2 * Math.PI * (phase - 0.28));

  let hopY = 0;
  let squashX = 1;
  let squashY = 1;
  let bodyTiltDeg = 0;
  let frontLegDeg = 0;
  let backLegDeg = 0;
  let talismanDeg = 8;
  let tasselDeg = 6;
  let headNodDeg = 1.4 * Math.sin(2 * Math.PI * (phase - 0.1));
  let shadowScale = 1.04;
  let shadowOpacity = 0.38;
  let dustOpacity = 0;
  let dustX = 0;
  let dustY = 0;
  let dustScale = 0.7;
  let scrollBobY = 0;

  if (isGround) {
    const w = phase < 0.18 ? (phase + 0.14) / 0.32 : (phase - 0.86) / 0.32;
    const impact = Math.sin(w * Math.PI);
    hopY = 0;
    squashX = 1 + 0.08 * impact;
    squashY = 1 - 0.095 * impact;
    bodyTiltDeg = 1.6 * Math.sin(w * 2 * Math.PI);
    frontLegDeg = 0;
    backLegDeg = 0;
    shadowScale = 1.04 + 0.04 * impact;
    shadowOpacity = 0.38 + 0.05 * impact;
    dustOpacity = Math.max(0, 0.74 * impact);
    dustX = 3 + 13 * w;
    dustY = -1.5 - 4.5 * impact;
    dustScale = 0.68 + 0.54 * w;
    talismanDeg = 8 - 15 * impact + 2 * flutterWave;
    tasselDeg = 6 - 12 * impact + 3 * tasselWave;
    headNodDeg += 3.2 * impact;
    scrollBobY = 1.2 * impact;
  } else {
    const u = (phase - 0.18) / 0.68;
    const arch = 4 * u * (1 - u);
    hopY = -14 * arch;
    squashX = 1 - 0.06 * arch;
    squashY = 1 + 0.06 * arch;
    bodyTiltDeg = (-6.5 * (1 - u) + 2.5 * u) * arch;
    frontLegDeg = 19 * arch;
    backLegDeg = -15 * arch;
    shadowScale = 1.04 - 0.33 * arch;
    shadowOpacity = 0.38 - 0.17 * arch;
    talismanDeg = 8 + 20 * arch + 2 * flutterWave;
    tasselDeg = 6 + 19 * arch + 3 * tasselWave;
    headNodDeg += -4.2 * arch;
    scrollBobY = -3.2 * arch;
  }

  // Secondary overlapping sleeve swing
  const armPhase = phase - 0.12;
  const frontArmDeg = -8 + 11 * Math.sin(2 * Math.PI * armPhase);
  const backArmDeg = -5 + 10 * Math.sin(2 * Math.PI * (armPhase - 0.16));

  // Periodic natural eye blink (~140ms every 3.1s + lane offset)
  const blinkPeriod = 3.1 + safeLane * 0.7;
  const bt = ((elapsedSec % blinkPeriod) + blinkPeriod) % blinkPeriod;
  const blinkScaleY = bt < 0.14 ? 1 - 0.92 * Math.sin((bt / 0.14) * Math.PI) : 1;

  return {
    phase,
    strideMultiplier,
    hopY,
    squashX,
    squashY,
    bodyTiltDeg,
    frontArmDeg,
    backArmDeg,
    frontLegDeg,
    backLegDeg,
    talismanDeg,
    tasselDeg,
    headNodDeg,
    shadowScale,
    shadowOpacity,
    dustOpacity,
    dustX,
    dustY,
    dustScale,
    blinkScaleY,
    scrollBobY,
  };
}

export function applyJiangshiPoseToDom(
  handles: JiangshiPartHandles | undefined,
  pose: JiangshiPose
): void {
  if (!handles) return;

  if (handles.hopper) {
    handles.hopper.style.transform = `translate3d(0px, ${pose.hopY.toFixed(2)}px, 0) scale3d(${pose.squashX.toFixed(4)}, ${pose.squashY.toFixed(4)}, 1) rotate(${pose.bodyTiltDeg.toFixed(2)}deg)`;
  }
  if (handles.shadow) {
    handles.shadow.style.transform = `scale3d(${pose.shadowScale.toFixed(3)}, ${pose.shadowScale.toFixed(3)}, 1)`;
    handles.shadow.style.opacity = pose.shadowOpacity.toFixed(3);
  }
  if (handles.dust) {
    handles.dust.style.transform = `translate3d(${pose.dustX.toFixed(2)}px, ${pose.dustY.toFixed(2)}px, 0) scale3d(${pose.dustScale.toFixed(3)}, ${pose.dustScale.toFixed(3)}, 1)`;
    handles.dust.style.opacity = pose.dustOpacity.toFixed(3);
  }
  if (handles.backArm) {
    handles.backArm.style.transform = `rotate(${pose.backArmDeg.toFixed(2)}deg)`;
  }
  if (handles.frontArm) {
    handles.frontArm.style.transform = `rotate(${pose.frontArmDeg.toFixed(2)}deg)`;
  }
  if (handles.backLeg) {
    handles.backLeg.style.transform = `rotate(${pose.backLegDeg.toFixed(2)}deg)`;
  }
  if (handles.frontLeg) {
    handles.frontLeg.style.transform = `rotate(${pose.frontLegDeg.toFixed(2)}deg)`;
  }
  if (handles.head) {
    handles.head.style.transform = `rotate(${pose.headNodDeg.toFixed(2)}deg)`;
  }
  if (handles.talisman) {
    handles.talisman.style.transform = `rotate(${pose.talismanDeg.toFixed(2)}deg)`;
  }
  if (handles.tassel) {
    handles.tassel.style.transform = `rotate(${pose.tasselDeg.toFixed(2)}deg)`;
  }
  if (handles.eyelid) {
    handles.eyelid.style.transform = `scale3d(1, ${pose.blinkScaleY.toFixed(3)}, 1)`;
  }
  if (handles.scrollWrap) {
    handles.scrollWrap.style.transform = `translate3d(0px, ${pose.scrollBobY.toFixed(2)}px, 0)`;
  }
}

interface LaneTheme {
  robeTop: string;
  robeBottom: string;
  robeBack: string;
  hatCrown: string;
  hatRib: string;
  trimGold: string;
  trimLight: string;
  badgeBg: string;
  tasselRed: string;
}

const LANE_THEMES: readonly LaneTheme[] = [
  {
    robeTop: '#B91C1C',
    robeBottom: '#7F1D1D',
    robeBack: '#6B1414',
    hatCrown: '#991B1B',
    hatRib: '#FCA5A5',
    trimGold: '#F59E0B',
    trimLight: '#FDE68A',
    badgeBg: '#92400E',
    tasselRed: '#EF4444',
  },
  {
    robeTop: '#D97706',
    robeBottom: '#92400E',
    robeBack: '#78350F',
    hatCrown: '#B45309',
    hatRib: '#FDE68A',
    trimGold: '#FBBF24',
    trimLight: '#FEF3C7',
    badgeBg: '#065F46',
    tasselRed: '#F97316',
  },
  {
    robeTop: '#1D4ED8',
    robeBottom: '#1E3A8A',
    robeBack: '#172554',
    hatCrown: '#1E40AF',
    hatRib: '#93C5FD',
    trimGold: '#F59E0B',
    trimLight: '#FDE68A',
    badgeBg: '#7C2D12',
    tasselRed: '#DC2626',
  },
];

interface JiangshiPuppetProps {
  laneIndex: number;
  isHit: boolean;
  isDefeated: boolean;
  registerHandles: (laneIndex: number, handles: Partial<JiangshiPartHandles> | null) => void;
}

const LAYER_BASE_CLASS = 'pointer-events-none absolute inset-0 will-change-transform';

export const JiangshiPuppet: React.FC<JiangshiPuppetProps> = React.memo(
  ({ laneIndex, isHit, isDefeated, registerHandles }) => {
    const safeLane = ((laneIndex % 3) + 3) % 3;
    const theme = LANE_THEMES[safeLane];
    const handlesRef = useRef<Partial<JiangshiPartHandles>>({
      hopper: null,
      shadow: null,
      dust: null,
      backArm: null,
      frontArm: null,
      backLeg: null,
      frontLeg: null,
      head: null,
      talisman: null,
      tassel: null,
      eyelid: null,
    });

    useEffect(() => {
      registerHandles(laneIndex, handlesRef.current);
      return () => {
        registerHandles(laneIndex, null);
      };
    }, [laneIndex, registerHandles]);

    const uid = `j_${safeLane}`;
    const stunned = isHit || isDefeated;
    const rigState = isDefeated ? 'defeated' : isHit ? 'hit' : 'hopping';

    return (
      <div
        data-testid={`jiangshi-rig-${laneIndex}`}
        data-state={rigState}
        className="pointer-events-none relative h-16 w-14 shrink-0 select-none sm:h-[92px] sm:w-[78px]"
        aria-hidden="true"
      >
        {/* Ground Contact Shadow */}
        <div
          ref={(el) => {
            handlesRef.current.shadow = el;
          }}
          data-part="shadow"
          className={LAYER_BASE_CLASS}
          style={{ transformOrigin: '51.6% 92.1%' }}
        >
          <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
            <ellipse cx="62" cy="129" rx="25" ry="6" fill="#2A160B" opacity="0.88" />
          </svg>
        </div>

        {/* Landing Sand/Courtyard Dust Puff */}
        <div
          ref={(el) => {
            handlesRef.current.dust = el;
          }}
          data-part="dust"
          className={LAYER_BASE_CLASS}
          style={{ transformOrigin: '70% 88.5%', opacity: 0 }}
        >
          <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
            <circle cx="80" cy="125" r="5" fill="#F5E6C8" opacity="0.9" />
            <circle cx="87" cy="122" r="3.8" fill="#FFFDF8" opacity="0.85" />
            <circle cx="92" cy="126" r="2.8" fill="#E7D1A7" opacity="0.8" />
          </svg>
        </div>

        {/* Main Articulated Hopper Rig (scales cleanly around ground line y=128) */}
        <div
          ref={(el) => {
            handlesRef.current.hopper = el;
          }}
          data-part="hopper"
          className={LAYER_BASE_CLASS}
          style={{ transformOrigin: '50% 91.4%' }}
        >
          {/* Back Arm (far side stretched toward left fence) */}
          <div
            ref={(el) => {
              handlesRef.current.backArm = el;
            }}
            data-part="back-arm"
            className={LAYER_BASE_CLASS}
            style={{ transformOrigin: '40% 60%' }}
          >
            <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
              <path
                d="M49 78 L22 72 C18 71 16 74 16 78 L18 85 C19 88 23 89 27 88 L49 87 Z"
                fill={theme.robeBack}
                stroke="#3E2415"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path
                d="M22 72 L21 88"
                stroke={theme.trimGold}
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              {/* Far Hand */}
              <circle cx="15" cy="79" r="5.2" fill="#CDEEE2" stroke="#3E2415" strokeWidth="2" />
            </svg>
          </div>

          {/* Back Leg */}
          <div
            ref={(el) => {
              handlesRef.current.backLeg = el;
            }}
            data-part="back-leg"
            className={LAYER_BASE_CLASS}
            style={{ transformOrigin: '41.7% 77.1%' }}
          >
            <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
              <rect
                x="44"
                y="108"
                width="12"
                height="13"
                rx="3"
                fill="#1F2937"
                stroke="#3E2415"
                strokeWidth="2"
              />
              {/* Boot */}
              <path
                d="M39 119 C39 117 42 116 47 116 L55 116 C57 116 58 118 58 121 L57 125 C57 127 55 128 52 128 L40 128 C37 128 36 125 37 122 Z"
                fill="#111827"
                stroke="#3E2415"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M38 126.5 L56 126.5" stroke="#FEF3C7" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>

          {/* Front Leg */}
          <div
            ref={(el) => {
              handlesRef.current.frontLeg = el;
            }}
            data-part="front-leg"
            className={LAYER_BASE_CLASS}
            style={{ transformOrigin: '55% 77.1%' }}
          >
            <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
              <rect
                x="59"
                y="108"
                width="13"
                height="13"
                rx="3"
                fill="#374151"
                stroke="#3E2415"
                strokeWidth="2"
              />
              {/* Front Qing Boot */}
              <path
                d="M54 120 C54 117 58 116 64 116 L71 116 C73 116 74 118 74 121 L73 126 C73 127.5 71 128 68 128 L55 128 C52 128 51 125 52 122 Z"
                fill="#18181B"
                stroke="#3E2415"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M53 126.5 L72 126.5" stroke="#FFFBEB" strokeWidth="2.3" strokeLinecap="round" />
              <circle cx="57" cy="122" r="1.4" fill={theme.trimGold} />
            </svg>
          </div>

          {/* Robe Torso */}
          <div data-part="torso" className={LAYER_BASE_CLASS}>
            <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id={`${uid}_robe`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.robeTop} />
                  <stop offset="100%" stopColor={theme.robeBottom} />
                </linearGradient>
              </defs>
              {/* Main A-line Qing Robe Silhouette */}
              <path
                d="M45 73 L75 73 C80 83 84 98 83 112 C83 115 80 116 76 116 L41 116 C37 116 35 114 36 110 C38 96 41 83 45 73 Z"
                fill={`url(#${uid}_robe)`}
                stroke="#3E2415"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
              {/* Bottom Wave/Cloud Gold Embroidery Trim */}
              <path
                d="M38 111 Q44 107 50 111 Q56 107 62 111 Q68 107 74 111 Q79 108 82 111"
                fill="none"
                stroke={theme.trimGold}
                strokeWidth="2.3"
                strokeLinecap="round"
              />
              {/* Mandarin Collar & Diagonal Placket */}
              <path
                d="M46 73 Q59 79 73 73"
                fill="none"
                stroke={theme.trimLight}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M57 77 L46 86 L46 115"
                fill="none"
                stroke={theme.trimGold}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              {/* Imperial Chest Square (Buzi) */}
              <rect
                x="49"
                y="82"
                width="16"
                height="13"
                rx="2.5"
                fill={theme.badgeBg}
                stroke={theme.trimGold}
                strokeWidth="1.8"
              />
              <path
                d="M53 89 Q57 84 61 89 Q57 93 53 89 Z"
                fill={theme.trimLight}
                opacity="0.92"
              />
              {/* Jade Waist Belt */}
              <rect
                x="40"
                y="98"
                width="41"
                height="4.5"
                rx="2"
                fill={theme.trimGold}
                stroke="#3E2415"
                strokeWidth="1.4"
              />
              <circle cx="53" cy="100.3" r="2.2" fill="#FEF3C7" stroke="#3E2415" strokeWidth="1" />
            </svg>
          </div>

          {/* Head + Qing Hat + Forehead Talisman + Hat Tassel */}
          <div
            ref={(el) => {
              handlesRef.current.head = el;
            }}
            data-part="head"
            className={LAYER_BASE_CLASS}
            style={{ transformOrigin: '49.2% 52.1%' }}
          >
            {/* Hat Silk Tassel (behind/top right of finial knob, trails with jump wind) */}
            <div
              ref={(el) => {
                handlesRef.current.tassel = el;
              }}
              data-part="tassel"
              className={LAYER_BASE_CLASS}
              style={{ transformOrigin: '51.7% 10%' }}
            >
              <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
                <path
                  d="M62 14 C75 11 85 16 90 25 C84 26 78 22 63 17 Z"
                  fill={theme.tasselRed}
                  stroke="#3E2415"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <circle cx="88" cy="24" r="2.5" fill={theme.trimGold} stroke="#3E2415" strokeWidth="1.3" />
              </svg>
            </div>

            <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
              <defs>
                <radialGradient id={`${uid}_skin`} cx="40%" cy="42%" r="65%">
                  <stop offset="0%" stopColor="#ECFAF4" />
                  <stop offset="72%" stopColor="#D7F2E7" />
                  <stop offset="100%" stopColor="#BAE5D4" />
                </radialGradient>
              </defs>

              {/* Back Right Ear */}
              <ellipse cx="83" cy="54" rx="5.2" ry="6.5" fill="#CDEEE2" stroke="#3E2415" strokeWidth="2.2" />
              <path d="M82 52 Q84.5 54 82 56" fill="none" stroke="#3E2415" strokeWidth="1.5" strokeLinecap="round" />

              {/* Head Silhouette */}
              <ellipse
                cx="57"
                cy="53"
                rx="25"
                ry="22.5"
                fill={`url(#${uid}_skin)`}
                stroke="#3E2415"
                strokeWidth="2.5"
              />

              {/* Rosy Chibi Cheeks */}
              <ellipse cx="37" cy="59.5" rx="4.4" ry="2.7" fill="#FDA4AF" opacity="0.88" />
              <ellipse cx="64" cy="60.5" rx="4.6" ry="2.8" fill="#FDA4AF" opacity="0.88" />

              {/* Tiny Nose & Cute Expression */}
              <path d="M46.5 55.5 Q48 54 49.5 55.5" fill="none" stroke="#3E2415" strokeWidth="1.7" strokeLinecap="round" />
              {stunned ? (
                <ellipse
                  cx="51"
                  cy="63"
                  rx="3.4"
                  ry="4"
                  fill="#991B1B"
                  stroke="#3E2415"
                  strokeWidth="1.6"
                />
              ) : (
                <path
                  d="M46 61.5 Q50.5 66 55.5 61.5"
                  fill="#E11D48"
                  stroke="#3E2415"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}

              {/* Qing Official Hat Dome & Brim */}
              <path
                d="M34 29 C38 14 50 11 61 11 C72 11 82 15 86 29 Z"
                fill={theme.hatCrown}
                stroke="#3E2415"
                strokeWidth="2.3"
                strokeLinejoin="round"
              />
              {/* Hat Crown Ribbing */}
              <path
                d="M47 26 Q51 15 58 12 M61 25 L61 11 M74 26 Q71 16 64 12"
                fill="none"
                stroke={theme.hatRib}
                strokeWidth="1.4"
                opacity="0.72"
                strokeLinecap="round"
              />
              {/* Velvet Turned-up Brim */}
              <path
                d="M27 32 C35 23 82 23 89 32 C91 36 88 39 83 38 C69 34 45 34 31 38 C26 39 25 35 27 32 Z"
                fill="#18181B"
                stroke={theme.trimGold}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {/* Gold Finial Button */}
              <circle cx="61" cy="10" r="4.2" fill={theme.trimGold} stroke="#3E2415" strokeWidth="1.8" />
              <circle cx="59.8" cy="8.8" r="1.2" fill="#FEF3C7" />
            </svg>

            {/* Animated Blinking Eyes / Dizzy Eyes Layer */}
            <div
              ref={(el) => {
                handlesRef.current.eyelid = el;
              }}
              data-part="eyelid"
              className={LAYER_BASE_CLASS}
              style={{ transformOrigin: '46% 37.8%' }}
            >
              <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
                {stunned ? (
                  <>
                    <path
                      d="M36 48 L43 52 L36 56"
                      fill="none"
                      stroke="#3E2415"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M65 48 L58 52 L65 56"
                      fill="none"
                      stroke="#3E2415"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                ) : (
                  <>
                    {/* Left Eyebrow & Eye */}
                    <path d="M35 44 Q40 42 44 44" fill="none" stroke="#3E2415" strokeWidth="1.9" strokeLinecap="round" />
                    <ellipse cx="40.5" cy="52.5" rx="4.4" ry="5.1" fill="#3E2415" />
                    <circle cx="38.8" cy="50.5" r="1.7" fill="#FFFFFF" />
                    <circle cx="42" cy="54.2" r="0.8" fill="#FFFFFF" opacity="0.8" />

                    {/* Right Eyebrow & Eye */}
                    <path d="M56 44 Q61 42 66 44" fill="none" stroke="#3E2415" strokeWidth="1.9" strokeLinecap="round" />
                    <ellipse cx="60.5" cy="52.5" rx="4.7" ry="5.2" fill="#3E2415" />
                    <circle cx="58.7" cy="50.5" r="1.8" fill="#FFFFFF" />
                    <circle cx="62" cy="54.2" r="0.8" fill="#FFFFFF" opacity="0.8" />
                  </>
                )}
              </svg>
            </div>

            {/* Fluttering Forehead Taoist Talisman */}
            <div
              ref={(el) => {
                handlesRef.current.talisman = el;
              }}
              data-part="talisman"
              className={LAYER_BASE_CLASS}
              style={{ transformOrigin: '35.8% 21.4%' }}
            >
              <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
                <rect
                  x="36"
                  y="30"
                  width="13"
                  height="21"
                  rx="2"
                  fill="#FDE68A"
                  stroke="#B45309"
                  strokeWidth="1.7"
                />
                {/* Cinnabar Red Seal Glyph */}
                <path
                  d="M39.5 34.5 L45.5 34.5 M42.5 34.5 L42.5 38.5 M39.5 38.5 L45.5 38.5 L40 42.5 L45 45 L41 48"
                  fill="none"
                  stroke="#DC2626"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* Front Arm (near side stretched toward left fence) */}
          <div
            ref={(el) => {
              handlesRef.current.frontArm = el;
            }}
            data-part="front-arm"
            className={LAYER_BASE_CLASS}
            style={{ transformOrigin: '54.2% 59.3%' }}
          >
            <svg viewBox="0 0 120 140" className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id={`${uid}_arm`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={theme.robeTop} />
                  <stop offset="100%" stopColor={theme.robeBottom} />
                </linearGradient>
              </defs>
              <path
                d="M65 78 L36 78 C32 78 30 81 30 85 L31 92 C32 95 36 96 40 94 L66 89 C69 88 70 83 68 80 Z"
                fill={`url(#${uid}_arm)`}
                stroke="#3E2415"
                strokeWidth="2.3"
                strokeLinejoin="round"
              />
              {/* Gold Sleeve Cuff Trim */}
              <path
                d="M35 78 L36 94.5"
                stroke={theme.trimGold}
                strokeWidth="3"
                strokeLinecap="round"
              />
              {/* Cute Outstretched Chibi Hand */}
              <circle cx="28" cy="86" r="5.5" fill="#D7F2E7" stroke="#3E2415" strokeWidth="2.1" />
              <path d="M24 85 L21 85" stroke="#3E2415" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
    );
  }
);

JiangshiPuppet.displayName = 'JiangshiPuppet';
