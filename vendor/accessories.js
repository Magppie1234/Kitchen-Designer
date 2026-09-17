// lib/accessories.js — zone accessory packs, from "Accessories List with Zone and
// Wall Details.xlsx" (zone eligibility + position) and the historical plans (counts).
// Each accessory: { name, position, qty } where qty is how many go in that zone
// (once/twice). Zones: cooking (hob wall) · washing (sink wall) · cooling (fridge
// wall) · island · other (any other wall). Positions map to a drawer/cabinet kind.
//
// position: 'LB' low-back drawer · 'HB' high-back drawer · 'pullout' · 'sink'
//           · 'aboveSink' · 'wallAccessory' · 'ceilingHung' · 'aboveCounter'

export const ZONE_ACCESSORIES = {
  cooking: [
    { name: 'Cutlery Tray Silverstone', position: 'LB', qty: 1 },
    { name: 'Spice & Chakla Tray (10 canisters)', position: 'LB', qty: 1 },
    { name: 'SS Masala / Pulse Canister Tray', position: 'HB', qty: 1 },
    { name: 'Pot & Pan Holder', position: 'HB', qty: 1 },
    { name: 'Drawer Divider for Lids & Pans', position: 'HB', qty: 1 },
    { name: 'Bottle Pullout', position: 'pullout', qty: 1 },
    { name: 'Tark System', position: 'wallAccessory', qty: 1 },  // open shelving
    { name: 'Kubos', position: 'wallAccessory', qty: 1 },        // open shelving
  ],
  washing: [
    { name: 'Wastebin Pullout (14×2 / 30 ltr)', position: 'pullout', qty: 1 },
    { name: 'Detergent Pullout (3 baskets)', position: 'sink', qty: 1 },
  ],
  cooling: [
    { name: 'Double Tray', position: 'wallAccessory', qty: 1 },
    { name: 'Tark System', position: 'wallAccessory', qty: 1 },
    { name: 'Kubos', position: 'wallAccessory', qty: 1 },
  ],
  island: [
    { name: 'Ceiling Hanging Unit (cloud glass + LED)', position: 'ceilingHung', qty: 1 },
    { name: 'Cutlery Tray Silverstone', position: 'LB', qty: 1 },
  ],
  other: [
    { name: 'Tark System', position: 'wallAccessory', qty: 1 },
    { name: 'Kubos', position: 'wallAccessory', qty: 1 },
  ],
};

// Return the accessory pack for a zone (flattened by qty into individual items
// would be ZONE_ACCESSORIES[zone] expanded; here we return the {name,qty} list).
export function accessoriesForZone(zone) {
  return ZONE_ACCESSORIES[zone] || [];
}

// Roll accessory packs for a set of zones present in the kitchen into a flat
// bill: [{ name, position, qty }] merged across zones (qty summed by name+position).
export function accessoriesFor(zones) {
  const bill = new Map();
  for (const z of zones) {
    for (const a of accessoriesForZone(z)) {
      const k = `${a.name}|${a.position}`;
      const cur = bill.get(k) || { name: a.name, position: a.position, qty: 0 };
      cur.qty += a.qty;
      bill.set(k, cur);
    }
  }
  return [...bill.values()];
}
