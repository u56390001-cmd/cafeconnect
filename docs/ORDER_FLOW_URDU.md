# Order Flow — Asaan Roman Urdu Guide

Yeh guide batati hai ke order banata hua chalta hai step by step. Sab kuch
server se price karta hai (quote API), browser sirf dikhata hai.

---

## 1. POS (Counter) se Order — Main Flow

### Step 1: Products choose karo
- Dashboard → **POS tab** khoro.
- Upar **search bar** me product ka naam likho, ya neeche **category chips**
  (Show All / Biryani / Drinks...) se filter karo.
- Product tile pe **click** karo:
  - Agar product me options hain (size, spice level, extras) →
    **Options sheet** khul jaye gi. Options tick karo → **Add** dabao.
  - Simple product → order panel me **foran add** ho jata hai.
- Sold out product ka button **disabled** hota hai (tick nahi hoga).

### Step 2: Order panel me adjust karo
- Right side panel me har line ka **quantity + / −**, **note** aur
  **remove** button hota hai.
- Line ka note likhna optional hai (kitchen ke liye, e.g. "kam mirchi").

### Step 3: Customer aur fulfilment
- Customer ka **name** aur **phone** likho.
- **Pickup** ya **Delivery** select karo. Delivery ho to **address** zaroori hai.
- Jese hi details theek hoti hain, **quote auto-update** hoti hai:
  subtotal, discount (offer), delivery fee, total — sab server se aata hai.

### Step 4: Order place karo (3 buttons)
| Button | Kya karta hai | Kab dabana |
|---|---|---|
| **KOT** | Order save hota hai, kitchen ticket print hoti hai, payment baad me | Kitchen me bhejne ke liye (cash customer abhi de raha hai) |
| **Bill** | Order save + payment confirm + receipt | Customer ne payment de di |
| **Bill print** | Bill save + payment confirm + receipt print bhi | Receipt chahiye jaldi |

- Payment method dialog me se chuno (e.g. **Cash on delivery**).
- Agar payment instantly confirm nahi ho sakti → order save hota hai aur
  **Orders tab me manager payment confirm** kare ga ("payment pending" notice).

### Step 5: Order ke bad — Orders tab
- **Orders tab** me recent orders list hoti hai.
- Status flow: `received → confirming → preparing → ready → completed`
- Har stage ka **status button** available hai (next status pe le jata hai).
- KOT dabane ke baad status khud pehle step pe advance ho jata hai.

---

## 2. Draft Order (Adhoora Order)

Kabhi customer ka order adhoora ho → **"Draft list"** button dabao:

- **Save draft:** order panel ka pura data (items, notes, options, customer)
  save ho jata hai, panel reset.
- **Load draft:** Draft list sheet kholti hai → draft pick karo →
  items wapas panel me aa jate hain, continue karo.
- Purane chhute hue draft clear ho jate hain (abandoned) — sirf
  `active` aur `awaiting_confirmation` drafts list me aate hain.

---

## 3. "+ New" Button

- Naya order start karta hai: panel clear, fresh order line zero.
- Agar panel me unsaved items hain to pehle unka khayal karo
  (drafts me save kar ke).

---

## 4. Customer Side Flow (Widget / WhatsApp)

1. Customer **chat widget** (website) ya **WhatsApp** pe message karta hai.
2. **AI assistant** menu, offers, knowledge base se jawab deta hai aur
   cart bana deta hai.
3. Customer confirm kare → **quote** banti hai (server pricing).
4. Order place hota hai → status **Orders tab** me dikhta hai.
5. Customer apna order **/track** page se track kar sakta hai.

**Chats tab** me staff AI ko pause kar ke manually reply bhej sakta hai
(`Reply` box) — AI "paused" ho jata hai jab tak dobara enable na karo.

---

## 5. Ek Nazar Me Yaad Rakho

- **Browser ke price pe trust na karo** — hamesha quote API ka total lo.
- **Offer** sirf qualified cart pe lagti hai; pickup pe delivery fee nahi.
- **Sold out** items dikhte hain lekin add nahi ho sakte.
- Print na karne ke bad bhi order history me safe hota hai.
- Kisi bhi step pe error ho to screen pe **Alert message** aata hai —
  connection theek kar ke retry karo.
