/** Default salon catalog — same data as salonx-web-v2 `mockClients` / `mockServices`. */
export const DEFAULT_CLIENTS = [
  { id: "c-001", name: "Cristi Curls", phone: "541-555-0101", email: "cristi@example.com", notes: "" },
  { id: "c-002", name: "Jon Klein", phone: "541-555-0102", email: "jon@example.com", notes: "" },
  { id: "c-003", name: "Joe Styles", phone: "541-555-0103", email: "joe@example.com", notes: "" },
  { id: "c-004", name: "Nita Haredoo", phone: "541-555-0104", email: "nita@example.com", notes: "" },
  { id: "c-005", name: "Sara Bloom", phone: "541-555-0105", email: "sara@example.com", notes: "" },
  { id: "c-006", name: "Mark Rivera", phone: "541-555-0106", email: "mark@example.com", notes: "" },
  { id: "c-007", name: "Ava Chen", phone: "541-555-0107", email: "ava@example.com", notes: "" },
] as const;

/** Salon staff roster — calendar day-view columns. */
export const DEFAULT_STAFF = [
  { id: "staff-cristi", name: "Cristi Curls" },
  { id: "staff-jon", name: "Jon Klein" },
  { id: "staff-joe", name: "Joe Styles" },
  { id: "staff-nita", name: "Nita Haredoo" },
] as const;

export const DEFAULT_SERVICES = [
  { id: "SVC-001", name: "Men's Haircut", price: 35, image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&fit=crop" },
  { id: "SVC-002", name: "Men's Haircut & Style", price: 60, image: "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&fit=crop" },
  { id: "SVC-003", name: "Women's Haircut", price: 65, image: "https://images.unsplash.com/photo-1560066984-138daab8c8a3?w=400&fit=crop" },
  { id: "SVC-004", name: "Women's Cut & Blowout", price: 90, image: "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=400&fit=crop" },
  { id: "SVC-005", name: "Kids' Haircut", price: 25, image: "https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=400&fit=crop" },
  { id: "SVC-006", name: "Buzz Cut", price: 20, image: "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400&fit=crop" },
  { id: "SVC-007", name: "Bang Trim", price: 15, image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&fit=crop" },
  { id: "SVC-008", name: "Beard Trim", price: 20, image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&fit=crop" },
  { id: "SVC-009", name: "Single Process Color", price: 90, image: "https://images.unsplash.com/photo-1492106087820-71f1a00d2b11?w=400&fit=crop" },
  { id: "SVC-010", name: "Root Touch-Up", price: 75, image: "https://images.unsplash.com/photo-1519699471015-095539c83213?w=400&fit=crop" },
  { id: "SVC-011", name: "Partial Highlights", price: 130, image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&fit=crop" },
  { id: "SVC-012", name: "Full Highlights", price: 175, image: "https://images.unsplash.com/photo-1522337342785-9e0eac5f5f0b?w=400&fit=crop" },
  { id: "SVC-013", name: "Partial Balayage", price: 160, image: "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=400&fit=crop" },
  { id: "SVC-014", name: "Full Balayage", price: 225, image: "https://images.unsplash.com/photo-1620331310696-e3ded8b53b15?w=400&fit=crop" },
  { id: "SVC-015", name: "Color Gloss / Toner", price: 50, image: "https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400&fit=crop" },
  { id: "SVC-016", name: "Double Process Color", price: 200, image: "https://images.unsplash.com/photo-1634449571010-02389ed0f9b0?w=400&fit=crop" },
  { id: "SVC-017", name: "Color Correction", price: 150, image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&fit=crop" },
  { id: "SVC-018", name: "Men's Gray Camouflage", price: 40, image: "https://images.unsplash.com/photo-1500840216050-6ffa99d75160?w=400&fit=crop" },
  { id: "SVC-019", name: "Blowout", price: 50, image: "https://images.unsplash.com/photo-1522338140262-f46f5913618a?w=400&fit=crop" },
  { id: "SVC-020", name: "Blowout with Iron Work", price: 65, image: "https://images.unsplash.com/photo-1519699471015-095539c83213?w=400&fit=crop" },
  { id: "SVC-021", name: "Updo / Special Event", price: 95, image: "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=400&fit=crop" },
  { id: "SVC-022", name: "Bridal Trial", price: 150, image: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=400&fit=crop" },
  { id: "SVC-023", name: "Bridal Hair (Day-Of)", price: 200, image: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=400&fit=crop" },
  { id: "SVC-024", name: "Deep Conditioning Treatment", price: 30, image: "https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=400&fit=crop" },
  { id: "SVC-025", name: "Bond Repair (Olaplex/K18)", price: 40, image: "https://images.unsplash.com/photo-1620331310696-e3ded8b53b15?w=400&fit=crop" },
  { id: "SVC-026", name: "Scalp Treatment", price: 35, image: "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=400&fit=crop" },
  { id: "SVC-027", name: "Keratin Smoothing Treatment", price: 275, image: "https://images.unsplash.com/photo-1522337342785-9e0eac5f5f0b?w=400&fit=crop" },
  { id: "SVC-028", name: "Brazilian Blowout", price: 300, image: "https://images.unsplash.com/photo-1522338140262-f46f5913618a?w=400&fit=crop" },
  { id: "SVC-029", name: "Perm", price: 130, image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&fit=crop" },
  { id: "SVC-030", name: "Tape-In Extensions Install", price: 180, image: "https://images.unsplash.com/photo-1634449571010-02389ed0f9b0?w=400&fit=crop" },
] as const;
