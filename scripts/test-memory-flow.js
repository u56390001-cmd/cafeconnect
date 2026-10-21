const key = "wa_ab3b0b0e85594ffa9e566949";
const endpoint = "https://cafeconnect-rho.vercel.app/api/widget/message";
const visitorId = "phase3_visitor_001";
let conversationId = null;

async function ask(message, label) {
  const t0 = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicWidgetId: key,
      message,
      visitorId,
      conversationId: conversationId ?? undefined,
    }),
  });
  const data = await res.json();
  conversationId = data?.data?.conversationId ?? conversationId;
  console.log(`\n[${label}] ${Date.now() - t0}ms`);
  console.log("REPLY:", data?.data?.reply ?? JSON.stringify(data));
  return data;
}

// 1) The customer states a name and a language preference.
await ask("Mera naam Umar hai. Roman Urdu mein jawab do please", "1-name+language");

// 2) A follow-up: the agent should not ask for the name again.
await ask("Menu me kya hai?", "2-followup");

// 3) A correction: the name changes - the newer value must win.
await ask("Actually mera naam Usman hai, pehle Umar likh diya tha", "3-correction");
