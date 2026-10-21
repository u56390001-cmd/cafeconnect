const fs = require("fs");
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const admin = require("firebase-admin");
let privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/^"|"$/g, "").replace(/\\n/g, "\n");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const db = admin.firestore();
const TENANT = "00wnUFnHmaFu7I3fASMh";
const OWNER = "bmmVZTi8q8bF9alx4ZFe3ajyDAR2";
const now = new Date();

const MENU = [
  { cat: "Biryani", name: "Chicken Biryani Half", price: 25000, desc: "Half portion chicken biryani with raita" },
  { cat: "Biryani", name: "Special Biryani (Chicken + Beef)", price: 55000, desc: "Our signature double-meat biryani" },
  { cat: "Biryani", name: "Chicken Tikka Biryani", price: 40000, desc: "Biryani with smoky chicken tikka" },
  { cat: "Shuwarma", name: "Chicken Shawarma", price: 30000, desc: "Chicken, garlic sauce, fries in saj bread" },
  { cat: "Shuwarma", name: "Zinger Shawarma", price: 40000, desc: "Crispy chicken fillet shawarma" },
  { cat: "Shuwarma", name: "Cheese Shawarma Platter", price: 45000, desc: "Shawarma with extra cheese and fries" },
  { cat: "Pizza", name: "Chicken Fajita Pizza (Medium)", price: 65000, desc: "Fajita chicken, olives, bell peppers" },
  { cat: "Pizza", name: "Cheese Pizza (Medium)", price: 55000, desc: "Classic mozzarella cheese pizza" },
  { cat: "Burger", name: "Chicken Burger", price: 45000, desc: "Grilled chicken patty with fries" },
  { cat: "Burger", name: "Beef Burger", price: 55000, desc: "Beef patty with cheese and sauces" },
  { cat: "Burger", name: "Zinger Burger", price: 60000, desc: "Crispy zinger fillet burger" },
];

const KNOWLEDGE = [
  {
    title: "Opening Hours",
    category: "businessInfo",
    content:
      "We are open daily from 12:00 PM to 12:00 AM (midnight). The kitchen stops taking orders 30 minutes before closing, so please place your order before 11:30 PM.",
  },
  {
    title: "Delivery Information",
    category: "policy",
    content:
      "We deliver within Sargodha city, up to a 6 km radius. Delivery charges are PKR 100. Minimum order value is PKR 300. Delivery usually takes 30-45 minutes depending on the time of day. Orders are confirmed by phone within 10 minutes.",
  },
  {
    title: "Payment Methods",
    category: "policy",
    content:
      "We accept cash on delivery, card on delivery, JazzCash and EasyPaisa. Digital payment details are shared on the phone when the order is confirmed.",
  },
  {
    title: "Cancellation Policy",
    category: "policy",
    content:
      "Free cancellation is allowed up to 30 minutes before the delivery time. After that the food is already prepared, so the order cannot be cancelled or refunded.",
  },
  {
    title: "Dine-in and Parking",
    category: "businessInfo",
    content:
      "Dine-in is available on the ground floor and in the family hall upstairs (air-conditioned). Free parking is available in front of the restaurant for 20 vehicles.",
  },
  {
    title: "Allergen Information",
    category: "faq",
    content:
      "Our kitchen handles wheat, dairy, gluten, nuts and soy. Biryani contains rice, meat and spices. If you have a food allergy, please tell us before ordering so the kitchen can advise.",
  },
  {
    title: "Large Orders and Catering",
    category: "faq",
    content:
      "For orders of 20 people or more (and for catering), please place the order at least 24 hours in advance so the kitchen can plan the cooking time.",
  },
  {
    title: "Spice Level",
    category: "faq",
    content:
      "Our biryani is served medium spicy by default. You can ask for mild, medium or extra hot when you order.",
  },
];

(async () => {
  const tenantRef = db.collection("tenants").doc(TENANT);

  // Business profile
  await tenantRef.collection("profile").doc("main").set(
    {
      tenantId: TENANT,
      businessName: "Sargodha Biryani & BBQ",
      businessType: ["restaurant"],
      country: "PK",
      currency: "PKR",
      timezone: "Asia/Karachi",
      phone: "+92 345 7175634",
      address: "Main Boulevard, Sargodha, Punjab",
      hours: "Daily 12:00 PM - 12:00 AM (midnight)",
      status: "active",
      updatedAt: now,
    },
    { merge: true }
  );

  // Delivery + ordering settings
  await tenantRef.collection("settings").doc("delivery").set(
    {
      tenantId: TENANT,
      deliveryFeeMinor: 10000,
      minimumOrderMinor: 30000,
      deliveryArea: "Sargodha city, up to 6 km radius",
      pickupAvailable: true,
      paymentMethods: "Cash on delivery, Card on delivery, JazzCash, EasyPaisa",
      orderInstructions:
        "Orders are confirmed by phone within 10 minutes. Delivery takes 30-45 minutes.",
      updatedAt: now,
    },
    { merge: true }
  );

  // AI personality
  await tenantRef.collection("settings").doc("ai").set(
    {
      tenantId: TENANT,
      greeting:
        "Assalam-o-Alaikum! Sargodha Biryani & BBQ mein khush aamdeed. Menu, prices aur offers bata deta hoon. Kya aap order karna chahte hain?",
      tone:
        "Warm, respectful and concise. Reply in Roman Urdu when the customer writes in Roman Urdu, English otherwise. Never invent prices, items or timings.",
      language: "en",
      handoffNote:
        "Main thora check kar ke aapko confirm karta hoon, thori der mein jawab de doonga.",
      updatedAt: now,
    },
    { merge: true }
  );

  // Categories lookup
  const cats = await tenantRef.collection("menuCategories").get();
  const catByName = {};
  for (const c of cats.docs) catByName[c.data().name] = c.id;

  // Menu items
  const existingItems = await tenantRef.collection("menuItems").get();
  const existingNames = new Set(existingItems.docs.map((d) => d.data().name));
  for (const item of MENU) {
    if (existingNames.has(item.name)) continue;
    const ref = tenantRef.collection("menuItems").doc();
    await ref.set({
      itemId: ref.id,
      tenantId: TENANT,
      categoryId: catByName[item.cat] || null,
      name: item.name,
      description: item.desc,
      basePriceMinor: item.price,
      availability: "available",
      publicationStatus: "published",
      imageReferences: [],
      branchId: null,
      status: "active",
      version: 1,
      createdBy: OWNER,
      updatedBy: OWNER,
      createdAt: now,
      updatedAt: now,
    });
    console.log("added item:", item.name);
  }

  // Offers: keep the existing one active, add two more
  const offers = await tenantRef.collection("offers").get();
  for (const o of offers.docs) {
    await o.ref.set({ endAt: null, status: "active", updatedAt: now }, { merge: true });
    console.log("offer kept active:", o.data().name);
  }
  const offerNames = new Set(offers.docs.map((d) => d.data().name));
  const newOffers = [
    {
      name: "Flat PKR 100 Off Above 1500",
      description: "Flat PKR 100 discount on orders above PKR 1500",
      type: "fixedDiscount",
      valueMinor: 10000,
      minOrderMinor: 150000,
    },
    {
      name: "Family Biryani Deal - 15% Off",
      description: "15% off on family biryani deals (2 biryani + naan + salad)",
      type: "percentage",
      valuePct: 15,
      minOrderMinor: 100000,
    },
  ];
  for (const offer of newOffers) {
    if (offerNames.has(offer.name)) continue;
    const ref = tenantRef.collection("offers").doc();
    await ref.set({
      offerId: ref.id,
      tenantId: TENANT,
      name: offer.name,
      description: offer.description,
      type: offer.type,
      valuePct: offer.valuePct ?? null,
      valueMinor: offer.valueMinor ?? null,
      minOrderMinor: offer.minOrderMinor ?? null,
      stackable: false,
      startAt: null,
      endAt: null,
      status: "active",
      version: 1,
      createdBy: OWNER,
      updatedBy: OWNER,
      createdAt: now,
      updatedAt: now,
    });
    console.log("added offer:", offer.name);
  }

  // Knowledge base
  const kb = await tenantRef.collection("knowledgeBase").get();
  const kbTitles = new Set(kb.docs.map((d) => d.data().title));
  for (const entry of KNOWLEDGE) {
    if (kbTitles.has(entry.title)) continue;
    const ref = tenantRef.collection("knowledgeBase").doc();
    await ref.set({
      documentId: ref.id,
      tenantId: TENANT,
      title: entry.title,
      contentReference: entry.content,
      category: entry.category,
      language: "en",
      branchId: null,
      sourceType: "manual",
      sourceReference: null,
      status: "published",
      version: 1,
      effectiveAt: now,
      reviewAt: null,
      createdBy: OWNER,
      updatedBy: OWNER,
      createdAt: now,
      updatedAt: now,
    });
    console.log("added knowledge:", entry.title);
  }

  console.log("seed complete");
  process.exit(0);
})();
