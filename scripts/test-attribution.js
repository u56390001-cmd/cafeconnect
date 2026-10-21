const key = "wa_ab3b0b0e85594ffa9e566949";
const endpoint = "https://cafeconnect-rho.vercel.app/api/widget/message";
const visitorId = "attr_visitor_001";
let conversationId = null;

async function ask(message, label) {
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
  console.log(`\n[${label}]`);
  console.log("REPLY:", data?.data?.reply ?? JSON.stringify(data));
  return data;
}

// 1) Ask for a recommendation, then order the recommended item so we can
//    measure recommendation acceptance (attribution on the order).
await ask("Mujhe kya order karna chahiye? 1000 ke andar", "1-recommend");
await ask(
  "Chicken Biryani Full le lo. Mera naam Umar hai, phone 03001234567, delivery address Faisal Town street 5 house 44 Sargodha",
  "2-add"
);
await ask("Haan confirm kar do", "3-confirm");
