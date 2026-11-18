const common = new Set('a anh ba ban be bo cac can chau chi cho co con cua da dang day de di do duoc em gi hay hoi khong la lam ma me minh mot nao nay neu nha nhieu noi ra roi sao se tai the thi toi tu va vao ve voi'.split(' '));
const singleTermTopics = new Set(['yct', 'hsk', 'hskk', 'pinyin', 'cantonese', 'mandarin', 'ipad', 'iphone', 'android', 'zoom', 'vietqr']);
export const consultationExampleLimit = 120;

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd')
    .replace(/\b(ko|k|kh)\b/g, 'khong').replace(/\b(nhiu|nhju)\b/g, 'nhieu')
    .replace(/\b(dc|dk)\b/g, word => word === 'dc' ? 'duoc' : 'dang ky')
    .replace(/\b(\d{1,2})t\b/g, '$1 tuoi')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isAdultTutoringRequest(question) {
  const safeQuestion = String(question || '').replace(/(?<=^|[^\p{L}\p{N}_])còn(?=$|[^\p{L}\p{N}_])/giu, 'conx');
  const text = normalize(safeQuestion).replace(/\b1 500\s?k\b/g, '1500k');
  const childNoun = '(?:be|con|chau)(?: (?:trai|gai|nho|lon|ut|dau)){0,2}';
  const possessor = '(?:(?:cua )?(?:nha )?(?:toi|minh|chi|anh|em) )?';
  if (new RegExp(`\\b(?:cho ${childNoun}|${childNoun} ${possessor}(?:\\d{1,2} tuoi)|tre em|thieu nhi)\\b`).test(text)) return false;
  if (new RegExp(`\\b${childNoun} ${possessor}(?:can|muon|hoc)\\b`).test(text)) return false;
  if (/\bnguoi di lam\b/.test(text)) return true;
  if (/\b(?:tieng trung cong so|giao tiep (?:trong )?cong viec|tieng trung thuong mai|cong so|thuong mai|963\s?k|1500\s?k|1\s?tr\s?5|963\s?k (?:va|voi|vs) 1500\s?k)\b/.test(text)) {
    return true;
  }
  const hasChildCue = /\b(?:be|con|chau|tre em|thieu nhi|hoc sinh|mam non|tieu hoc|yct)\b/.test(text);
  const hasPackageComparison = /\b(?:(?:hai|2) goi (?:nay )?khac (?:gi|nhau)|so sanh (?:hai |2 )?goi|goi co ban (?:va|voi) goi chuyen sau)\b/.test(text);
  const hasAdultWorkingContext = /\b(?:ke toan|van phong|nhan su|kinh doanh|xuat nhap khau|nhap hang|nha cung cap|doi tac|cong ty|di lam|nguoi lon|cong viec|lam viec|moi bat dau|mat goc)\b/.test(text);
  return !hasChildCue && hasPackageComparison && hasAdultWorkingContext;
}

function terms(value) {
  const words = normalize(value).split(' ').filter(Boolean);
  return new Set(words.flatMap((word, index) => {
    const tokens = !common.has(word) && (word.length >= 2 || /\d/.test(word)) ? [word] : [];
    if (index + 1 < words.length && (!common.has(word) || word === 'tu') && !common.has(words[index + 1])) {
      tokens.push(word + ' ' + words[index + 1]);
    }
    return tokens;
  }));
}

export function consultationExample(item) {
  const clean = (text, max) => typeof text === 'string' ? text.trim().slice(0, max) : '';
  return {
    question: clean(item?.question, 1000),
    answer: clean(item?.answer, 2000),
    hints: Array.isArray(item?.hints) ? [...new Set(item.hints.map(hint => clean(hint, 80)).filter(Boolean))].slice(0, 12) : []
  };
}

export function retrieveConsultationExamples(examples, question, earlierQuestions = []) {
  const query = terms(question);
  if (!query.size) return [];
  const previous = terms(earlierQuestions.slice(-2).join(' '));
  const documents = examples.map(consultationExample).filter(item => item.question && item.answer)
    .map(example => ({
      example,
      questions: new Set([example.question, ...example.hints].flatMap(value => [...terms(value)])),
      answer: terms(example.answer)
    }));
  const frequency = new Map();
  for (const document of documents) {
    for (const token of document.questions) frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  function matches(tokens, document) {
    let score = 0;
    for (const token of tokens) {
      const weight = Math.log1p(documents.length / ((frequency.get(token) || 0) + 1));
      const phrase = singleTermTopics.has(token) ? 3 : token.includes(' ') ? 1.9 : 1;
      if (document.questions.has(token)) score += weight * phrase;
      else if (document.answer.has(token)) score += weight * phrase * 0.24;
    }
    return score;
  }
  const scored = documents.map(document => {
    const direct = [...query].filter(token => document.questions.has(token));
    const relevant = direct.some(token => token.includes(' ') || singleTermTopics.has(token)) ||
      direct.length >= 2;
    const current = matches(query, document);
    return { example: document.example, relevant, current, score: current + 0.28 * matches(previous, document) };
  }).filter(item => item.relevant && item.current >= 2.2).sort((left, right) => right.score - left.score);
  const threshold = Math.max(2.2, (scored[0]?.score || 0) * 0.36);
  return scored.filter(item => item.score >= threshold).slice(0, 4)
    .map(({ example }) => ({ question: example.question, answer: example.answer }));
}
