/*
A jib de televisão atrás de cada baliza (js/staff.js, config `GruaDeCamera`).

Pedido, com duas fotografias: uma grua atrás de cada gol, com a câmara na
ponta — e à SEGUNDA passagem, *"a grua tá gigante"* e *"tem que ficar paralela
à linha de fundo"*. A primeira versão tinha 5.2 m de pivô e 12 m de lança a
atravessar o ar por cima da baliza: uma grua de obra. O que se mede aqui é o
que as fotografias mostram:

  - duas gruas, uma por baliza, com a base FORA das placas de publicidade;
  - à escala de uma jib: a câmara à altura de um homem, não a 7 m;
  - a lança PARALELA à linha de fundo (o mesmo z da base) e a apontar para o
    eixo da baliza;
  - nada dela entra no campo;
  - o contrapeso do lado de fora e mais alto que o pivô (a ponta desce);
  - a câmara do modelo virada para o relvado, e a vista da tecla 8 ligada.
*/
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const semCR = s => s.split(CR + LF).join(LF);
const raiz = path.join(__dirname, '..');
const ler = f => semCR(fs.readFileSync(path.join(raiz, f), 'utf8'));

const cfg = ler('js/config/physics.js')
    .match(/const GruaDeCamera = \{[\s\S]*?\n\};/)[0];
// Só a parte das gruas do staff.js: o resto arrasta o crowd.js inteiro.
const srcStaff = ler('js/staff.js');
const gruas = srcStaff.slice(srcStaff.indexOf('const GruasDeCamera = {'));

const CAMPO_COMP = 106;
const LINHA_FUNDO = CAMPO_COMP / 2;

const amb = { THREE, console, ALTURA_BALIZA: 2.44, LARGURA_BALIZA: 7.32, LINHA_FUNDO };
const mod = new Function(...Object.keys(amb),
    `${cfg}
     ${gruas}
     return { GruasDeCamera, GruaDeCamera };`)(...Object.values(amb));
const { GruasDeCamera, GruaDeCamera } = mod;

let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };

const GEO = { placaX: 34 + 5, placaZ: LINHA_FUNDO + 5 };

const grupo = new THREE.Group();
const n = GruasDeCamera.build(grupo, GEO);
grupo.updateMatrixWorld(true);

if (n !== 2) erro(`${n} gruas — esperada uma por baliza`);
if (grupo.children.length !== 2) erro(`${grupo.children.length} grupos na cena`);

/* --- A escala: é uma jib, não uma grua de obra ------------------------- */
{
    const G = GruaDeCamera;
    if (G.alturaPivo > 3.0) erro(`pivô a ${G.alturaPivo} m — uma jib de televisão não passa dos 3`);
    if (G.comprimentoLanca > 7.0) erro(`lança de ${G.comprimentoLanca} m — na fotografia são ~5`);
}

/* --- Cada grua, peça a peça ------------------------------------------- */
grupo.children.forEach((g, i) => {
    let lente = null, lanca = null, peso = null;

    g.traverse(o => {
        if (!o.isMesh) return;
        const p = o.geometry.parameters || {};
        if (o.geometry.type === 'CylinderGeometry') lente = o;
        else if (p.depth === GruaDeCamera.comprimentoLanca) lanca = o;
        else if (p.width === GruaDeCamera.contrapeso &&
            p.depth === GruaDeCamera.contrapeso) peso = o;
    });

    if (!lente) { erro(`grua ${i}: sem objectiva`); return; }
    if (!lanca) { erro(`grua ${i}: sem lança`); return; }
    if (!peso) { erro(`grua ${i}: sem contrapeso`); return; }

    const pLente = lente.getWorldPosition(new THREE.Vector3());
    const pPeso = peso.getWorldPosition(new THREE.Vector3());
    const pBase = g.getWorldPosition(new THREE.Vector3());
    const sinal = Math.sign(pBase.z);

    // A base fica atrás das placas, e ao lado do eixo da baliza.
    if (Math.abs(pBase.z) <= GEO.placaZ) {
        erro(`grua ${i}: a base está a ${Math.abs(pBase.z).toFixed(1)} m, à frente das placas`);
    }
    if (Math.abs(pBase.x) < 8) erro(`grua ${i}: a base está demasiado perto do eixo da baliza`);

    /*
    PARALELA À LINHA DE FUNDO: a câmara tem de ficar no MESMO z da base. É esta
    a asserção que a versão anterior falhava — a lança apontava para dentro do
    campo e a ponta ficava 12 m à frente da base.
    */
    if (Math.abs(pLente.z - pBase.z) > 0.6) {
        erro(`grua ${i}: a lança não é paralela ao fundo (base z=${pBase.z.toFixed(1)}, ` +
            `câmara z=${pLente.z.toFixed(1)})`);
    }
    // E aponta para o EIXO da baliza, não para fora do estádio.
    if (Math.abs(pLente.x) >= Math.abs(pBase.x) - 3) {
        erro(`grua ${i}: a lança aponta para fora (base x=${pBase.x.toFixed(1)}, ` +
            `câmara x=${pLente.x.toFixed(1)})`);
    }

    // Nada entra no campo.
    if (Math.abs(pLente.z) <= LINHA_FUNDO) {
        erro(`grua ${i}: a câmara entrou no campo (z=${pLente.z.toFixed(1)})`);
    }

    // À altura de um homem: entre um metro e dois e meio.
    if (pLente.y < 1.0 || pLente.y > 2.5) {
        erro(`grua ${i}: a câmara a ${pLente.y.toFixed(2)} m não é a altura de uma jib`);
    }

    /*
    O contrapeso fica para FORA, mais longe do eixo do que a base, e mais alto
    que o pivô: a ponta desce, logo a traseira sobe.
    */
    if (Math.abs(pPeso.x) <= Math.abs(pBase.x)) {
        erro(`grua ${i}: o contrapeso ficou do lado do campo`);
    }
    if (pPeso.y <= GruaDeCamera.alturaPivo) {
        erro(`grua ${i}: o contrapeso não acompanhou a inclinação da lança`);
    }

    /*
    A objectiva aponta para o relvado. O que se mede é o EIXO DO CILINDRO, que
    nasce em +Y e é ele que a rotação deita — medir o +Z do mesmo objecto dava
    a vertical e dizia "aponta para o chão" em qualquer caso.
    */
    const frente = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(lente.getWorldQuaternion(new THREE.Quaternion()));
    if (frente.z * -sinal <= 0.5) {
        erro(`grua ${i}: a câmara não está virada para o campo (z do eixo ${frente.z.toFixed(2)})`);
    }
});

/* --- A vista da tecla 8 tem de ter onde se pôr ------------------------- */
{
    if (!GruasDeCamera.cameras || GruasDeCamera.cameras.length !== 2) {
        erro('o build não deixou as duas câmaras para a vista da tecla 8');
    } else {
        for (const c of GruasDeCamera.cameras) {
            if (Math.sign(c.pos.z) !== c.ladoZ) {
                erro(`câmara marcada do lado ${c.ladoZ} mas em z=${c.pos.z.toFixed(1)}`);
            }
        }
    }

    // E a tecla existe mesmo, no sítio onde as outras câmaras vivem.
    const ui = ler('js/match/match_ui.js');
    if (!/e\.key === '8'\) this\.setCameraMode\('grua'\)/.test(ui)) {
        erro('a tecla 8 não liga a câmara da grua');
    }
    if (!/cameraMode === 'grua'/.test(ui)) {
        erro('o updateCamera não tem o ramo da grua');
    }
}

if (falhas) {
    console.error(`FALHOU: ${falhas} problema(s)`);
    process.exit(1);
}
console.log('OK grua_de_camera');
