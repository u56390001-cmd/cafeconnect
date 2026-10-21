const key = "wa_ab3b0b0e85594ffa9e566949";
const endpoint = "https://cafeconnect-rho.vercel.app/api/widget/message";
const visitorId = "phase56_visitor_001";
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

// 1) Recommendation with a budget
await ask("1500 ke andar 2 logon ke liye kya order karun?", "1-recommend");

// 2) Table booking
await ask(
  "Kal shaam 8 baje 4 logon ke liye table book kar do, mera naam Umar hai, phone 03001234567",
  "2-booking"
);

// 3) Human request -> handoff
await ask("Mujhe manager se baat karni hai", "3-handoff");
