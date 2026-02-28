(function () {
  const analyticsPath = "/_vercel/insights/script.js";

  if (location.protocol === "file:") {
    return;
  }

  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

  const existingScript = document.querySelector('script[data-dashi="vercel-analytics"]');
  if (existingScript) {
    return;
  }

  const script = document.createElement("script");
  script.defer = true;
  script.src = analyticsPath;
  script.dataset.dashi = "vercel-analytics";
  script.onerror = function () {
    // Host sin endpoint de Vercel Analytics (ej. preview local u otro hosting).
  };
  document.body.appendChild(script);
})();
