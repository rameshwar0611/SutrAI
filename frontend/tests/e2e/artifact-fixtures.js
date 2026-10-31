// Test-only source files. Production renders the real Redux artifact payload.
export const htmlFile = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>A reading list for the web</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="library">
    <header>
      <p class="eyebrow">A PERSONAL LIBRARY</p>
      <h1>Good ideas,<br>on a page.</h1>
      <p class="intro">A small collection of books worth returning to.</p>
    </header>
    <section class="books" aria-label="Reading list">
      <article><span>01 / SYSTEMS</span>
        <h2>Designing Data-Intensive Applications</h2>
        <p>Martin Kleppmann</p></article>
      <article><span>02 / CRAFT</span>
        <h2>The Pragmatic Programmer</h2>
        <p>David Thomas &amp; Andrew Hunt</p></article>
      <article><span>03 / DESIGN</span>
        <h2>The Design of Everyday Things</h2>
        <p>Don Norman</p></article>
    </section>
    <button id="add-book">Mark as reviewed</button>
    <footer id="count">3 books · A considered collection.</footer>
  </main>
  <script src="script.js"></script>
</body>
</html>`

export const cssFile = `* { box-sizing: border-box; }
body { margin: 0; background: #f6f8fc; color: #1e2c48;
  font-family: system-ui, sans-serif; }
.library { max-width: 960px; margin: auto; padding: 36px 28px; }
.eyebrow, article span { color: #2855d9; font-size: 11px;
  letter-spacing: .1em; }
h1 { font-size: clamp(32px, 6vw, 48px); line-height: 1.08;
  letter-spacing: -1.6px; margin: 22px 0; }
.intro, article p { color: #65748e; line-height: 1.7; }
.books { display: grid; gap: 14px; margin: 30px 0; }
article { background: white; border: 1px solid #dfe6f2;
  border-radius: 15px; padding: 22px; }
article h2 { font-size: 17px; line-height: 1.5; margin: 12px 0 5px; }
article p { font-size: 13px; margin: 0; }
button { border: 0; border-radius: 8px; padding: 12px 16px;
  background: #2855d9; color: white; cursor: pointer; }
footer { margin-top: 25px; color: #65748e; font-size: 12px; }`

export const jsFile = `const books = document.querySelectorAll('.books article');
const count = document.querySelector('#count');
count.textContent = books.length + ' books · A considered collection.';
document.querySelector('#add-book').addEventListener('click', event => {
  event.target.textContent = 'Reading list reviewed';
});`

export const artifact = { id: 101, type: 'Project', title: 'A reading list for the web', files: [
  { name: 'index.html', content: htmlFile }, { name: 'style.css', content: cssFile }, { name: 'script.js', content: jsFile },
] }

export function artifactMessages(value = artifact) {
  return [
    { _id: 'artifact-user', role: 'user', content: 'Build a minimal reading-list page with HTML, CSS and JavaScript. Keep it clear, responsive and easy to read.' },
    { _id: 'artifact-assistant', role: 'assistant', content: '## A small home for good ideas.\n\nHere’s a reading list with a simple layout, responsive book cards and a quiet visual hierarchy. Open the files to inspect the code, or switch to Preview to try the generated page.', artifacts: [value] },
  ]
}
