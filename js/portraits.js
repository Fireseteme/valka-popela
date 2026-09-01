"use strict";
/* Válka popela — procedurální portréty hrdinů.
   Každý hrdina má deterministický obličej: rasa podle frakce (lidé, elfové,
   orkové, démoni), odstín pleti a vlasy podle pořadí, doplněk podle
   schopnosti (jizva / kápě / přilba / čelenka). Kreslí se jednou do
   offscreen canvasu (2× rozlišení) a cachuje jako data-URL. */

const RACE_LOOK = {
  aldar:  { race: "human", skins: ["#e8bd93", "#d9a878", "#c98f63", "#efc9a4"],
            hair: ["#4a3524", "#241b12", "#7a5a33", "#8d857c"] },
  yllien: { race: "elf",   skins: ["#ead9b9", "#e0e0c2", "#d6cfae", "#e8d3ae"],
            hair: ["#d8c98a", "#8a7a4a", "#b7d0a0", "#e8e4d4"] },
  durgar: { race: "orc",   skins: ["#8aa050", "#7a9048", "#9aae62", "#6f8342"],
            hair: ["#241b12", "#3d2c1c", "#141110", "#4d3a24"] },
  horda:  { race: "demon", skins: ["#a3524a", "#8f4650", "#b06050", "#7e3e46"],
            hair: ["#221419", "#301a20", "#180e12", "#3a2026"] },
  // nové rody (v0.23) — zatím sdílejí archetypy vzhledu, vlastní přijdou s artem
  brakkar: { race: "human", skins: ["#d9a878", "#c98f63", "#e0b088", "#c68e6a"],
             hair: ["#8d857c", "#b8552e", "#4a3524", "#d8d2c8"] },
  sarn:    { race: "human", skins: ["#c98f63", "#b97f53", "#d9a878", "#a8703f"],
             hair: ["#241b12", "#3d2c1c", "#151210", "#5a3c20"] },
  vhorren: { race: "elf",   skins: ["#cfd2ce", "#c2c6c8", "#d8d4d8", "#b8bcc2"],
             hair: ["#e8e4d4", "#9b86c9", "#c8c2d8", "#6a6a7a"] },
  gryk:    { race: "orc",   skins: ["#9aae62", "#8aa050", "#a8b871", "#7d9148"],
             hair: ["#241b12", "#141110", "#3d2c1c", "#2a3018"] },
};

const portraitCache = {};

function heroPortraitURL(factionKey, defIdx) {
  const key = factionKey + ":" + defIdx;
  if (portraitCache[key]) return portraitCache[key];
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 128;
  const c = cv.getContext("2d");
  c.scale(2, 2);
  renderPortrait(c, factionKey, defIdx);
  portraitCache[key] = cv.toDataURL();
  return portraitCache[key];
}

function renderPortrait(c, fkey, defIdx) {
  const look = RACE_LOOK[fkey];
  const fdef = FACTION_DEFS.find(f => f.key === fkey);
  const trait = HERO_DEFS[fkey][defIdx].trait;
  const skin = look.skins[defIdx % look.skins.length];
  const hair = look.hair[defIdx % look.hair.length];
  const skinDark = shade(skin, -0.16);

  // pozadí v barvě frakce + viněta
  const bg = c.createLinearGradient(0, 0, 0, 64);
  bg.addColorStop(0, shade(fdef.color, -0.02));
  bg.addColorStop(1, shade(fdef.color, -0.34));
  c.fillStyle = bg; c.fillRect(0, 0, 64, 64);
  const rad = c.createRadialGradient(32, 24, 6, 32, 32, 42);
  rad.addColorStop(0, "rgba(255,255,255,0.12)");
  rad.addColorStop(1, "rgba(0,0,0,0.30)");
  c.fillStyle = rad; c.fillRect(0, 0, 64, 64);

  // ramena / zbroj v barvě frakce
  c.fillStyle = shade(fdef.color, -0.16);
  c.beginPath(); c.ellipse(32, 67, 22, 17, 0, Math.PI, 2 * Math.PI); c.fill();
  c.fillStyle = shade(fdef.color, 0.10);
  c.fillRect(19, 57, 26, 2.5);

  // krk
  c.fillStyle = skinDark;
  c.fillRect(28, 40, 8, 10);

  // rohy démonů kreslíme před hlavou (vyrůstají zpoza ní)
  if (look.race === "demon") {
    c.fillStyle = "#57333a";
    c.beginPath();
    c.moveTo(25, 23); c.quadraticCurveTo(17, 15, 20.5, 6);
    c.quadraticCurveTo(24.5, 13, 28, 20); c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(39, 23); c.quadraticCurveTo(47, 15, 43.5, 6);
    c.quadraticCurveTo(39.5, 13, 36, 20); c.closePath(); c.fill();
    c.fillStyle = "#7e4e56";
    c.beginPath(); c.arc(20.8, 7.2, 1.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(43.2, 7.2, 1.6, 0, Math.PI * 2); c.fill();
  }

  // uši (elfové dlouhé špičaté, orkové menší špičky)
  if (look.race === "elf") {
    c.fillStyle = skin;
    c.beginPath(); c.moveTo(23.5, 30); c.lineTo(16, 21.5); c.lineTo(22.5, 25); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(40.5, 30); c.lineTo(48, 21.5); c.lineTo(41.5, 25); c.closePath(); c.fill();
  } else if (look.race === "orc") {
    c.fillStyle = skin;
    c.beginPath(); c.moveTo(21, 30); c.lineTo(16.5, 25); c.lineTo(20.5, 25.5); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(43, 30); c.lineTo(47.5, 25); c.lineTo(43.5, 25.5); c.closePath(); c.fill();
  }

  // hlava podle rasy
  const rx = { human: 11, elf: 9.6, orc: 12, demon: 10.6 }[look.race];
  c.fillStyle = skin;
  c.beginPath(); c.ellipse(32, 30, rx, 13, 0, 0, Math.PI * 2); c.fill();
  if (look.race === "orc") { // široká čelist
    c.beginPath(); c.ellipse(32, 37.5, 11.4, 7, 0, 0, Math.PI * 2); c.fill();
  }
  // stín pod bradou
  c.fillStyle = "rgba(0,0,0,0.10)";
  c.beginPath(); c.ellipse(32, 40, rx * 0.7, 3.4, 0, 0, Math.PI); c.fill();

  // vlasy — čtyři střihy podle pořadí hrdiny
  const style = defIdx % 4;
  c.fillStyle = hair;
  if (style === 0) {          // krátký sestřih
    c.beginPath(); c.ellipse(32, 21.5, rx + 0.8, 7.5, 0, Math.PI, 2 * Math.PI); c.fill();
  } else if (style === 1) {   // dlouhé vlasy po ramena
    c.beginPath(); c.ellipse(32, 21.5, rx + 1.2, 7.5, 0, Math.PI, 2 * Math.PI); c.fill();
    c.fillRect(32 - rx - 1.5, 21, 5, 17);
    c.fillRect(32 + rx - 3.5, 21, 5, 17);
  } else if (style === 2) {   // drdol / uzel
    c.beginPath(); c.ellipse(32, 21, rx + 0.5, 6.5, 0, Math.PI, 2 * Math.PI); c.fill();
    c.beginPath(); c.arc(32, 14.5, 4, 0, Math.PI * 2); c.fill();
  } else {                    // číro / hřeben
    c.beginPath(); c.ellipse(32, 20.5, 4, 8.5, 0, 0, Math.PI * 2); c.fill();
  }

  // obočí a oči
  if (look.race === "orc") {
    c.fillStyle = shade(skin, -0.28);
    c.fillRect(24, 26, 16, 2.6); // těžké nadočnicové oblouky
  }
  if (look.race === "demon") {
    c.save();
    c.shadowColor = "#ffb545"; c.shadowBlur = 5;
    c.fillStyle = "#ffc355";
    c.beginPath(); c.arc(27.5, 29.5, 1.9, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(36.5, 29.5, 1.9, 0, Math.PI * 2); c.fill();
    c.restore();
  } else {
    c.fillStyle = "#221a12";
    c.beginPath(); c.arc(27.5, look.race === "orc" ? 30.5 : 29.5, 1.7, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(36.5, look.race === "orc" ? 30.5 : 29.5, 1.7, 0, Math.PI * 2); c.fill();
    if (look.race === "elf") { // jemné šikmé obočí
      c.strokeStyle = shade(hair, -0.15); c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(24.5, 27.5); c.lineTo(30, 26); c.stroke();
      c.beginPath(); c.moveTo(39.5, 27.5); c.lineTo(34, 26); c.stroke();
    }
  }

  // nos a ústa
  c.strokeStyle = skinDark; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(32, 31); c.lineTo(31.2, 34.5); c.stroke();
  c.strokeStyle = shade(skin, -0.3); c.lineWidth = 1.4;
  if (look.race === "orc") {
    c.beginPath(); c.moveTo(27, 39.5); c.lineTo(37, 39.5); c.stroke();
    c.fillStyle = "#efe6d0"; // kly
    c.beginPath(); c.moveTo(27.5, 40.5); c.lineTo(29.5, 40.5); c.lineTo(28.3, 36.5); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(34.5, 40.5); c.lineTo(36.5, 40.5); c.lineTo(35.7, 36.5); c.closePath(); c.fill();
  } else if (look.race === "demon") {
    c.beginPath(); c.moveTo(28.5, 38.5); c.lineTo(35.5, 38.5); c.stroke();
    c.fillStyle = "#efe6d0"; // drobné tesáky dolů
    c.beginPath(); c.moveTo(29, 38.7); c.lineTo(31, 38.7); c.lineTo(30, 41.2); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(33, 38.7); c.lineTo(35, 38.7); c.lineTo(34, 41.2); c.closePath(); c.fill();
  } else {
    c.beginPath(); c.moveTo(28.5, 38); c.lineTo(35.5, 38); c.stroke();
  }
  // vousy části lidských hrdinů
  if (look.race === "human" && defIdx % 2 === 1) {
    c.fillStyle = hair;
    c.beginPath(); c.ellipse(32, 40.5, 7.5, 4.5, 0, 0, Math.PI); c.fill();
  }

  // doplněk podle schopnosti
  if (trait === "attack") {          // jizva přes tvář
    c.strokeStyle = "#7e3a30"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(25.5, 23); c.lineTo(28.5, 33.5); c.stroke();
  } else if (trait === "swift") {    // kápě
    c.strokeStyle = shade(fdef.color, -0.24); c.lineWidth = 6.5;
    c.beginPath(); c.arc(32, 31, 15.5, Math.PI * 0.92, Math.PI * 2.08); c.stroke();
  } else if (trait === "shield") {   // přilba s nánosníkem
    c.fillStyle = "#9aa2ac";
    c.beginPath(); c.ellipse(32, 22.5, rx + 1.4, 8, 0, Math.PI, 2 * Math.PI); c.fill();
    c.fillRect(32 - rx - 1.4, 22.5, (rx + 1.4) * 2, 3);
    c.fillRect(30.6, 22, 2.8, 10);
    c.fillStyle = "#c3cad2";
    c.fillRect(32 - rx - 1.4, 22.5, (rx + 1.4) * 2, 1.2);
  } else if (trait === "tireless") { // čelenka
    c.fillStyle = "#e8c26a";
    c.fillRect(32 - rx - 0.5, 23, rx * 2 + 1, 3);
    c.fillStyle = "#fff3cf";
    c.beginPath(); c.arc(32, 24.5, 1.4, 0, Math.PI * 2); c.fill();
  } else if (trait === "mystic") {   // kápě a zářící znak na čele
    c.strokeStyle = shade(fdef.color, -0.30); c.lineWidth = 6.5;
    c.beginPath(); c.arc(32, 31, 15.5, Math.PI * 0.92, Math.PI * 2.08); c.stroke();
    c.save();
    c.shadowColor = "#9fc6ff"; c.shadowBlur = 6;
    c.fillStyle = "#cfe4ff";
    c.beginPath(); c.moveTo(32, 22.5); c.lineTo(34, 26); c.lineTo(32, 29.5);
    c.lineTo(30, 26); c.closePath(); c.fill();
    c.restore();
  } else if (trait === "healer") {  // šátek přes vlasy a bylinný znak
    c.fillStyle = "#e9eef2";
    c.beginPath(); c.arc(32, 30, rx + 1.2, Math.PI * 1.02, Math.PI * 1.98); c.fill();
    c.fillStyle = "#7fbf7a";
    c.fillRect(31.4, 22.6, 1.2, 4.2);
    c.fillRect(30, 24.1, 4, 1.2);
  }

  // rámeček
  c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 2;
  c.strokeRect(1, 1, 62, 62);
  c.strokeStyle = "rgba(255,255,255,0.10)"; c.lineWidth = 1;
  c.strokeRect(2.5, 2.5, 59, 59);
}
