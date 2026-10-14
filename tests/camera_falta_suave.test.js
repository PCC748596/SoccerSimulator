/*
A CAMERA DA FALTA SAI DEVAGAR (Match.updateCamera, CameraZoom.faltaCamSaida).
Relato: o enquadramento no meio do caminho entre a bola e a baliza desaparecia de um frame para o outro quando a
falta era cobrada. Corre o updateCamera com uma falta marcada, passa o estado a PLAY e mede o maior passo do alvo de
foco num frame: tem de ser pequeno (< 0.6 m) e o enquadramento tem de levar ~faltaCamSaida s a desaparecer.
*/
require('../tools/headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {}; Sim.running = true;
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

window.cameraCore = window.cameraCore || new THREE.PerspectiveCamera();
window.cameraMode = 'sideline';
window.lastFrameDelta = 1 / 60;
Match.init(new THREE.Scene());
const taker = Match.players.find(p => p.role === 'atk');
Match.setPieceTaker = taker;
Match.state = 'FREE_KICK';
Match.ball.position.set(5, 0.2, taker.targetGoalZ - Math.sign(taker.targetGoalZ) * 25);
Match.ballVel.set(0, 0, 0);

// Alvo de foco a cada frame, lido do currentLookTarget (ja suavizado) e do ponto medio.
const look = () => Match.currentLookTarget.clone();
for (let i = 0; i < 240; i++) Match.updateCamera();
const kAntes = Match._faltaK;
if (!(kAntes > 0.99)) erro('o enquadramento nao entrou: ' + kAntes);
const zAntes = look().z;

Match.state = 'PLAY';
let maxPasso = 0, prev = look(), frames = 0, k90 = null;
for (let i = 0; i < 60 * 5; i++) {
    Match.updateCamera(); frames++;
    const c = look(); maxPasso = Math.max(maxPasso, c.distanceTo(prev)); prev = c;
    if (k90 === null && Match._faltaK < 0.1) k90 = i / 60;
}
console.log(`peso ao cobrar ${kAntes.toFixed(2)}; maior passo do foco num frame ${maxPasso.toFixed(3)} m (z do foco: ${zAntes.toFixed(1)} -> ${look().z.toFixed(1)}); peso < 0.1 aos ${k90 === null ? '>5' : k90.toFixed(1)} s`);
if (maxPasso > 0.6) erro('a camera salta ' + maxPasso.toFixed(2) + ' m num frame');
if (k90 === null || k90 < 1.5) erro('o enquadramento desfez-se depressa de mais: ' + k90);
if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK camera_falta_suave');
