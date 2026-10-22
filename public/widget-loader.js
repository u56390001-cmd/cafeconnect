/*!
 * CafeConnect widget loader
 *
 * A tiny, dependency-free async loader that mounts the CafeConnect chat
 * widget on any website (static HTML, WordPress, Shopify, React/Next.js).
 *
 *   <script
 *     async
 *     src="https://YOUR-DOMAIN/widget-loader.js"
 *     data-widget-id="wa_xxx"
 *     data-position="bottom-right"
 *     data-theme="light"
 *   ></script>
 *
 * Design rules:
 * - The loader never blocks the host page (async script, no render-blocking).
 * - The widget runs inside an isolated iframe so host CSS cannot break it.
 * - Only a public widget id is used. No API keys, no secrets.
 * - postMessage traffic is origin checked on both sides.
 * - Visitor identity uses a first-party id in the widget origin, not
 *   third-party cookies.
 */
(function () {
  "use strict";

  var SCRIPT_TAG = document.currentScript;
  if (!SCRIPT_TAG) return;

  var script = SCRIPT_TAG;
  var origin = new URL(script.src, window.location.href).origin;

  var widgetId = script.getAttribute("data-widget-id") || "";
  var position = script.getAttribute("data-position") || "bottom-right";
  var theme = script.getAttribute("data-theme") || "";
  var zIndex = script.getAttribute("data-z-index") || "";
  var mobile = script.getAttribute("data-mobile") || "fullscreen";
  var containerId = script.getAttribute("data-container-id") || "cafeconnect-widget-root";

  // Only a public widget id is accepted; anything else is ignored.
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(widgetId)) {
    if (window.console && console.warn) {
      console.warn("[CafeConnect] data-widget-id is missing or invalid.");
    }
    return;
  }
  if (["bottom-right", "bottom-left"].indexOf(position) === -1) {
    position = "bottom-right";
  }
  if (["fullscreen", "panel"].indexOf(mobile) === -1) {
    mobile = "fullscreen";
  }

  var root = document.getElementById(containerId);
  if (!root) {
    root = document.createElement("div");
    root.id = containerId;
    document.body.appendChild(root);
  }
  if (root.getAttribute("data-cc-mounted") === "true") return;
  root.setAttribute("data-cc-mounted", "true");

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Chat with us");
  launcher.setAttribute("aria-expanded", "false");
  launcher.style.cssText = [
    "position:fixed",
    position === "bottom-left" ? "left:16px" : "right:16px",
    "bottom:16px",
    "z-index:" + (zIndex || "2147483000"),
    "display:flex",
    "align-items:center",
    "gap:8px",
    "min-height:48px",
    "padding:0 18px",
    "border:0",
    "border-radius:999px",
    "background:#ea580c",
    "color:#fff",
    "font:600 15px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    "cursor:pointer",
    "box-shadow:0 10px 30px rgba(0,0,0,.22)",
    "transition:transform .16s ease",
  ].join(";");
  launcher.setAttribute("aria-haspopup", "dialog");

  var launcherIcon = document.createElement("span");
  launcherIcon.setAttribute("aria-hidden", "true");
  launcherIcon.style.cssText =
    "display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center";
  launcherIcon.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>';
  launcher.appendChild(launcherIcon);

  var launcherLabel = document.createElement("span");
  launcherLabel.textContent = "Order with us";
  launcher.appendChild(launcherLabel);

  var frame = document.createElement("iframe");
  frame.title = "CafeConnect chat";
  frame.allow = "clipboard-write";
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = [
    "position:fixed",
    position === "bottom-left" ? "left:16px" : "right:16px",
    "bottom:16px",
    "width:min(400px,100vw)",
    "height:min(620px,88vh)",
    "max-height:100vh",
    "border:0",
    "border-radius:16px",
    "box-shadow:0 18px 48px rgba(0,0,0,.24)",
    "z-index:" + (zIndex || "2147483000"),
    "display:none",
    "background:#fff",
    "color-scheme:light",
  ].join(";");

  function widgetUrl() {
    var params = new URLSearchParams();
    params.set("key", widgetId);
    params.set("embed", "1");
    params.set("position", position);
    if (theme) params.set("theme", theme);
    if (mobile) params.set("mobile", mobile);
    return origin + "/widget?" + params.toString();
  }

  function applyMobileStyles(open) {
    if (mobile === "fullscreen" && window.matchMedia("(max-width: 640px)").matches) {
      frame.style.width = "100vw";
      frame.style.height = "100dvh";
      frame.style.left = "0";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.borderRadius = "0";
      frame.style.height = open ? "100dvh" : "0";
    }
  }

  var open = false;
  function setOpen(next) {
    open = next;
    launcher.setAttribute("aria-expanded", next ? "true" : "false");
    frame.style.display = next ? "block" : "none";
    launcher.style.transform = next ? "scale(0.92)" : "scale(1)";
    if (next) {
      applyMobileStyles(true);
      frame.src = frame.src || widgetUrl();
    } else {
      applyMobileStyles(false);
    }
    try {
      frame.contentWindow.postMessage(
        { type: "cafeconnect:visibility", visible: next },
        origin
      );
    } catch (error) {
      /* the frame may not be loaded yet */
    }
  }

  launcher.addEventListener("click", function () {
    setOpen(!open);
  });

  window.addEventListener("message", function (event) {
    // Only messages from our own origin are trusted.
    if (event.origin !== origin) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "cafeconnect:ready") {
      frame.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (data.type === "cafeconnect:toggle") {
      setOpen(!open);
    }
    if (data.type === "cafeconnect:open") {
      setOpen(true);
    }
    if (data.type === "cafeconnect:close") {
      setOpen(false);
    }
    if (data.type === "cafeconnect:resize" && data.height) {
      frame.style.height = Math.min(Number(data.height) + 16, window.innerHeight) + "px";
    }
  });

  root.appendChild(launcher);
  root.appendChild(frame);

  // Open the widget when the host page links to the store with #chat, so a
  // restaurant can send customers straight into the conversation.
  if (window.location.hash === "#chat") {
    setTimeout(function () {
      setOpen(true);
    }, 600);
  }
})();
