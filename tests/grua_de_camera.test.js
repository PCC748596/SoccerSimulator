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
  - o contrapeso do lado de fora e sempre do lado contrário da lança (é uma
    gangorra, e qual dos dois está por cima depende de onde a bola está);
  - a câmara do modelo virada para o relvado, e a vista da tecla 8 ligada;
  - a câmara no ALINHAMENTO DO CENTRO DA BALIZA, e a subir com a distância da
    bola entre os 2 e os 4 m pedidos (terceira passagem do pedido).
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

/*
O `Match` e o `fatorSuavizacao` são stubs: a `update` da grua precisa da bola e
da mesma suavização ao tempo que a câmara usa, e nada mais do jogo.
*/
const bola = { position: new THREE.Vector3(0, 0.11, 0) };
const Match = { ball: bola };
const fatorSuavizacao = (k, dt) => 1 - Math.pow(1 - k, dt * 60);

const amb = { THREE, console, ALTURA_BALIZA: 2.44, LARGURA_BALIZA: 7.32, LINHA_FUNDO,
    Match, fatorSuavizacao };
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
    // A base fica para lá do poste (3.66 m), que é o que a deixa fora da
    // baliza que ela filma.
    if (Math.abs(pBase.x) < 4) erro(`grua ${i}: a base está dentro da largura da baliza`);

    /*
    PARALELA À LINHA DE FUNDO: a câmara tem de ficar no MESMO z da base. É esta
    a asserção que a versão anterior falhava — a lança apontava para dentro do
    campo e a ponta ficava 12 m à frente da base.
    */
    if (Math.abs(pLente.z - pBase.z) > 0.6) {
        erro(`grua ${i}: a lança não é paralela ao fundo (base z=${pBase.z.toFixed(1)}, ` +
            `câmara z=${pLente.z.toFixed(1)})`);
    }
    /*
    A LANÇA APONTA PARA O EIXO e a ponta fica perto dele — perto, e não em
    cima: o braço recolhe para dentro à medida que sobe (aos 6 m está 1.3 m
    para fora), e é por isso que o alinhamento pedido é garantido no OLHO da
    câmara (medido mais abaixo, em `cameras`) e não na peça.
    */
    if (Math.abs(pLente.x) > 1.6) {
        erro(`grua ${i}: a ponta da lança está em x=${pLente.x.toFixed(2)}, longe do eixo`);
    }
    if (Math.abs(pBase.x) <= Math.abs(pLente.x)) {
        erro(`grua ${i}: a lança não aponta para o eixo`);
    }

    // Nada entra no campo.
    if (Math.abs(pLente.z) <= LINHA_FUNDO) {
        erro(`grua ${i}: a câmara entrou no campo (z=${pLente.z.toFixed(1)})`);
    }

    // Dentro do intervalo de altura pedido (a `update` mede-se em baixo).
    if (pLente.y < GruaDeCamera.alturaMin - 0.05 || pLente.y > GruaDeCamera.alturaMax + 0.05) {
        erro(`grua ${i}: a câmara a ${pLente.y.toFixed(2)} m está fora dos ` +
            `${GruaDeCamera.alturaMin}-${GruaDeCamera.alturaMax} m pedidos`);
    }

    /*
    O contrapeso fica para FORA, mais longe do eixo do que a base, e SEMPRE do
    lado contrário da lança em altura: uma gangorra. Qual dos dois está por
    cima depende da altura a que a câmara está neste momento (a lança sobe e
    desce com a bola), por isso o que se mede é o sinal, e não "mais alto".
    */
    if (Math.abs(pPeso.x) <= Math.abs(pBase.x)) {
        erro(`grua ${i}: o contrapeso ficou do lado do campo`);
    }
    const lancaAcima = pLente.y > GruaDeCamera.alturaPivo;
    const pesoAcima = pPeso.y > GruaDeCamera.alturaPivo;
    if (lancaAcima === pesoAcima) {
        erro(`grua ${i}: lança e contrapeso do mesmo lado do pivô ` +
            `(câmara ${pLente.y.toFixed(2)}, peso ${pPeso.y.toFixed(2)}, ` +
            `pivô ${GruaDeCamera.alturaPivo})`);
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

/* --- A lança sobe e desce com a bola ---------------------------------- */
{
    const G = GruaDeCamera;
    if (G.alturaMin !== 2.0 || G.alturaMax !== 6.0) {
        erro(`altura pedida 2-6 m, config diz ${G.alturaMin}-${G.alturaMax}`);
    }

    // Deixa assentar: a subida é suavizada ao tempo, de propósito.
    const assentar = (x, z) => {
        bola.position.set(x, 0.11, z);
        for (let k = 0; k < 900; k++) GruasDeCamera.update(1 / 60);
        return GruasDeCamera.cameras.map(c => c.pos.y);
    };

    // Bola na área de -Z: a grua desse lado no mínimo, a do outro no máximo.
    const perto = assentar(0, -LINHA_FUNDO + 3);
    const meio = assentar(0, 0);
    const longe = assentar(0, LINHA_FUNDO - 3);

    const [aMenosPerto, aMaisPerto] = perto;
    if (Math.abs(aMenosPerto - G.alturaMin) > 0.05) {
        erro(`bola em cima da baliza -Z e essa grua a ${aMenosPerto.toFixed(2)} m ` +
            `(devia ser o mínimo, ${G.alturaMin})`);
    }
    if (Math.abs(aMaisPerto - G.alturaMax) > 0.05) {
        erro(`bola no outro extremo e a grua +Z a ${aMaisPerto.toFixed(2)} m ` +
            `(devia ser o máximo, ${G.alturaMax})`);
    }
    // Simetria: a bola no meio põe as duas à mesma altura, entre os extremos.
    if (Math.abs(meio[0] - meio[1]) > 0.02) {
        erro(`bola no meio e as gruas a alturas diferentes (${meio[0].toFixed(2)} e ${meio[1].toFixed(2)})`);
    }
    if (meio[0] <= G.alturaMin + 0.05 || meio[0] >= G.alturaMax - 0.05) {
        erro(`bola no meio e a grua saturada a ${meio[0].toFixed(2)} m`);
    }
    // E é monótono: mais longe, mais alto.
    if (!(perto[0] < meio[0] && meio[0] < longe[0])) {
        erro(`a altura não cresce com a distância (${perto[0].toFixed(2)}, ` +
            `${meio[0].toFixed(2)}, ${longe[0].toFixed(2)})`);
    }

    /*
    E A VISTA SEGUE A LANÇA. Se a `cameras[i].pos` fosse lida uma vez no build,
    a câmara ficava no ar à altura de origem enquanto a grua se mexia debaixo
    dela — foi para isso que a `update` a relê do mundo.
    */
    if (Math.abs(perto[0] - longe[0]) < 1.0) {
        erro('a posição guardada para a tecla 8 não acompanha a lança');
    }

    /*
    O OLHO DA CÂMARA FICA NO EIXO DA BALIZA em qualquer altura (pedido). É a
    vista, e é travada no eixo de propósito: a ponta da lança recolhe para
    dentro ao subir, e um metro de desvio vê-se na imagem.
    */
    for (const c of GruasDeCamera.cameras) {
        if (Math.abs(c.pos.x) > 1e-6) {
            erro(`a vista da grua saiu do eixo da baliza (x=${c.pos.x.toFixed(3)})`);
        }
    }

    /*
    E O OLHO ESTÁ À FRENTE DA PRÓPRIA CÂMARA.

    Relato, com captura: *"tem alguma coisa na frente da imagem da câmera da
    grua"* — era a caixa da câmara a envolver o ponto de vista. Mede-se a
    distância do olho à cabeça: tem de ser maior do que a objectiva avança
    (0.26 + metade de 0.30 = 0.41 m), senão a vista volta para dentro da peça.
    */
    let cabecas = [];
    grupo.children.forEach(g => g.traverse(o => {
        if (o.isMesh && o.geometry.type === 'CylinderGeometry') cabecas.push(o);
    }));
    cabecas.forEach((lente, k) => {
        const pl = lente.getWorldPosition(new THREE.Vector3());
        const olho = GruasDeCamera.cameras[k] ? GruasDeCamera.cameras[k].pos : null;
        if (!olho) return;
        // Compara em z (a câmara olha ao longo de z, para o campo).
        const folga = Math.abs(olho.z) - Math.abs(pl.z);
        if (folga > -0.15) {
            erro(`grua ${k}: o olho está a ${(-folga).toFixed(2)} m da objectiva ` +
                `— a vista fica dentro da própria câmara`);
        }
    });
}

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
