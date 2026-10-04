// The one page a visitor sees before the passcode. Inline styles so it needs no assets.
export function loginPage(next: string, error?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#7cc46a">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>Treehouse</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center;
    font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
    background: linear-gradient(#bfe6ff, #e8f7d4); color: #2d3b23; }
  form { display: grid; gap: 16px; width: min(360px, calc(100vw - 32px)); text-align: center; }
  h1 { font-size: 40px; margin: 0; }
  input, button { font: inherit; font-size: 24px; padding: 16px; border-radius: 18px; border: 3px solid #6aa84f; }
  button { background: #7cc46a; color: white; font-weight: 700; }
  p { margin: 0; color: #b0412e; font-weight: 600; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>🌳 Treehouse</h1>
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <input name="passcode" type="password" autocomplete="current-password" placeholder="Family passcode" autofocus required>
  <button type="submit">Come in</button>
  ${error ? `<p>${escapeHtml(error)}</p>` : ""}
</form>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
