const key = "wa_ab3b0b0e85594ffa9e566949";
const endpoint = "https://cafeconnect-rho.vercel.app/api/widget/message";
let conversationId = null;

async function ask(message, label) {
  const t0 = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicWidgetId: key,
      message,
      customerReference: "phase2_test",
      conversationId: conversationId ?? undefined,
    }),
  });
  const data = await res.json();
  conversationId = data?.data?.conversationId ?? conversationId;
  console.log(`\n[${label}] ${Date.now() - t0}ms`);
  console.log("REPLY:", data?.data?.reply ?? JSON.stringify(data));
  return data;
}

await ask("Mujhe 2 chicken biryani chahiye", "1-items");
await ask("Ek biryani hatao aur 1 cheese pizza add kar do", "2-correction");
await ask(
  "Mera naam Umar hai, phone 03001234567, delivery address Faisal Town street 5 house 44 Sargodha.",
  "3-details"
);
await ask("Haan, order confirm kar do please", "4-confirm");
