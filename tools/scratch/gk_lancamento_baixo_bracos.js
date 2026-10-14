/*
OS BRACOS DO LANCAMENTO DE MAO POR BAIXO, frame a frame (GoalkeeperUnderarmThrowClip).
Para cada frame: altura (y) e avanco (z, + = a frente do corpo) das duas maos relativos aos pes, e a abertura do
braco. Pedido: o braco que lanca vai atras com a bola baixa e o outro vai a frente a apontar; a bola sai quando
o braco esta um pouco a frente do corpo; o outro braco faz o contrario (para tras) com o passo; atras, abertos.
Corre com: node tools/scratch/gk_lancamento_baixo_bracos.js
*/
require('../headless/harness.js');
const corpo = construirCorpo(0xff8800, 0x222222, escolherAparencia(0));
const model = corpo.corpo, rig = corpo.rig;
model.position.set(0, ALTURA_BASE_Y, 0);
const clip = GoalkeeperUnderarmThrowClip;
const n = clip.frames.length;
const v = new THREE.Vector3();
const f = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);
for (let i = 0; i < n; i++) {
    const K = amostrarClipLancamentoGR(i / (n - 1), clip);
    aplicarPoseLancamentoGR(rig, K);
    model.position.y = ALTURA_BASE_Y + K.altura;
    model.updateMatrixWorld(true);
    const m = (h) => { h.getWorldPosition(v); return `y ${f(v.y)} z ${f(v.z)} x ${f(v.x)}`; };
    console.log(`frame ${i + 1}: mao R(lanca) ${m(rig.rHand)} | mao L ${m(rig.lHand)}`);
}
