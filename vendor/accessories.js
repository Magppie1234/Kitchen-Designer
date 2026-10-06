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
