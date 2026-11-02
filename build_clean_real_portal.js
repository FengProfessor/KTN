const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lessonsPath = path.join(__dirname, 'clean_lessons_data.json');
const allCoursesPath = path.join(__dirname, 'all_courses_lessons_data.json');
const templatePath = path.join(__dirname, 'portal_template.html');
const prodOutPath = path.join(__dirname, 'sll-hocsinh.html');
const legacyOutPath = path.join(__dirname, 'demo_hsk1_student_portal.html');
const redundantPortalPath = path.join(__dirname, 'student-portal.html');

const lessons = JSON.parse(fs.readFileSync(lessonsPath, 'utf8'));
const allCourses = JSON.parse(fs.readFileSync(allCoursesPath, 'utf8'));
let template = fs.readFileSync(templatePath, 'utf8');

template = template
  .replace(/__LESSONS_DATA__/g, JSON.stringify(lessons))
  .replace(/__ALL_COURSES_DATA__/g, JSON.stringify(allCourses));

// Syntax validation on embedded JavaScript
const jsMatch = template.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i);
if (!jsMatch) {
  throw new Error('Fatal: Embedded <script> block not found in portal template!');
}
try {
  new vm.Script(jsMatch[1]);
} catch (syntaxErr) {
  console.error('Fatal JavaScript Syntax Error in built portal script:', syntaxErr);
  process.exit(1);
}

// Verification: Ensure no fake localStorage keys exist
const forbiddenKeys = ['ktn_enrolled_hsk1_', 'ktn_real_hw_', 'ktn_course_enroll_orders'];
const foundKeys = forbiddenKeys.filter(k => template.includes(k));
if (foundKeys.length > 0) {
  throw new Error('Integrity violation: forbidden fake localStorage keys detected: ' + foundKeys.join(', '));
}

fs.writeFileSync(prodOutPath, template, 'utf8');
fs.writeFileSync(legacyOutPath, template, 'utf8');
if (fs.existsSync(redundantPortalPath)) {
  fs.unlinkSync(redundantPortalPath);
}
console.log('Successfully built unified sll-hocsinh.html (single file, no iframe, no redundant student-portal.html)! Total lessons:', lessons.length);

