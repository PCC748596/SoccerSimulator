const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8');

// Ambiente mínimo para carregar os scripts
const contexto2d = new Proxy({}, {
    get: () => () => {},
    set: () => true
});
const documentoFalso = {
    createElement: () => ({ width: 0, height: 0, getContext: () => contexto2d })
};

const amb = {
    THREE,
    console,
    Math,
    document: documentoFalso,
    window: { addEventListener: () => {} }
};

const carregar = (ficheiros, exportar) => new Function(
    ...Object.keys(amb),
    `${ficheiros.map(ler).join('\n')}; return { ${exportar.join(', ')} };`
)(...Object.values(amb));

test('os antebraços começam levemente à frente na construção do modelo', () => {
    const mod = carregar(
        ['js/config/gait.js', 'js/config/player_behavior.js', 'js/utils.js', 'js/config/uniformes.js', 'js/pose.js'],
        ['construirCorpo', 'escolherAparencia']
    );
    const corpo = mod.construirCorpo('#ffffff', '#000000', mod.escolherAparencia(0, 11, 0));
    assert.ok(corpo.rig.lElbow.rotation.x < -0.2, `lElbow x=${corpo.rig.lElbow.rotation.x} deve estar flexionado para a frente`);
    assert.ok(corpo.rig.rElbow.rotation.x < -0.2, `rElbow x=${corpo.rig.rElbow.rotation.x} deve estar flexionado para a frente`);
});

test('as configurações de idle/repouso definem o cotovelo para a frente', () => {
    const modGait = carregar(['js/config/gait.js'], ['GaitModel']);
    assert.ok(modGait.GaitModel.parado.cotovelo < -0.2, `GaitModel.parado.cotovelo=${modGait.GaitModel.parado.cotovelo}`);

    const modGK = carregar(['js/config/physics.js', 'js/config/gait.js', 'js/config/player_behavior.js', 'js/config/goalkeeper.js'], ['GoalkeeperPose']);
    assert.ok(modGK.GoalkeeperPose.repouso.cotovelo < -0.2, `GoalkeeperPose.repouso.cotovelo=${modGK.GoalkeeperPose.repouso.cotovelo}`);
});

test('o código de animação e reset do jogador posiciona o antebraço para a frente em idle', () => {
    const srcPlayer = ler('js/player.js');
    // Em resetBonesToDefault no ramo default
    assert.ok(
        /rig\.lElbow\.rotation\.set\(-0\.3,\s*0,\s*0\)/.test(srcPlayer),
        'resetBonesToDefault deve definir rotação x negativa (-0.3) para lElbow'
    );
    // Em animateBones quando speed < 0.1
    assert.ok(
        /rig\.lElbow\.rotation\.x\s*=\s*lerpTo\(rig\.lElbow\.rotation\.x,\s*-0\.3/.test(srcPlayer),
        'animateBones deve interpolar lElbow para -0.3 em speed < 0.1'
    );
});
