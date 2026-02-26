/**
 * Tracking Code Injection Utility
 * Used by: agents/quiz-agent.js, agents/landing-page-agent.js
 * Exports: injectTrackingCodes(html, settings)
 *
 * Injects FB Pixel, Google Analytics 4, and custom code into generated HTML pages.
 * Reads tracking IDs from container.settings (fb_pixel_id, ga4_measurement_id, custom_head_code).
 */

function injectTrackingCodes(html, settings) {
  if (!html || !settings) return html;

  const snippets = [];

  // Facebook Pixel
  if (settings.facebook_pixel_id) {
    snippets.push(`<!-- Facebook Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${settings.facebook_pixel_id}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${settings.facebook_pixel_id}&ev=PageView&noscript=1"/></noscript>
<!-- End Facebook Pixel -->`);
  }

  // Google Analytics (GA4)
  if (settings.google_analytics_id) {
    snippets.push(`<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${settings.google_analytics_id}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${settings.google_analytics_id}');
</script>
<!-- End Google Analytics -->`);
  }

  // Custom head code
  if (settings.custom_head_code) {
    snippets.push(settings.custom_head_code);
  }

  // Inject before </head>
  if (snippets.length > 0) {
    const headCode = '\n' + snippets.join('\n') + '\n';
    const headCloseIdx = html.toLowerCase().indexOf('</head>');
    if (headCloseIdx !== -1) {
      html = html.substring(0, headCloseIdx) + headCode + html.substring(headCloseIdx);
    }
  }

  // Custom body code — inject before </body>
  if (settings.custom_body_code) {
    const bodyCloseIdx = html.toLowerCase().indexOf('</body>');
    if (bodyCloseIdx !== -1) {
      html = html.substring(0, bodyCloseIdx) + '\n' + settings.custom_body_code + '\n' + html.substring(bodyCloseIdx);
    }
  }

  return html;
}

module.exports = { injectTrackingCodes };
