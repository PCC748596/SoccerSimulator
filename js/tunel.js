/*
=============================================================================
O TUNEL DOS JOGADORES — a caixa (ver TunelJogadores, config/tunel.js)
=============================================================================
O corte nos degraus e as aberturas nas placas/no pessoal fazem-se no createField (match_setup.js) e no
Staff.build. Aqui fica so a CAIXA que fecha o buraco: chao escuro, duas paredes, tecto, fundo e uma faixa de luz
sob o tecto (emissiva — nao custa uma luz a sério) para o corredor nao ler como um buraco preto.

A caixa fica entre `xBoca` (a frente do 1.o degrau) e `xFundo` (a frente do degrau a seguir ao ultimo cortado, que
serve de parede do fundo). Tudo em x do lado `lado`; a abertura e em z = 0.
=============================================================================
*/
const Tunel = {
    construir: function (grupo) {
        const T = (typeof TunelJogadores !== 'undefined') ? TunelJogadores : null;
        if (!T || !T.activo || !grupo || typeof THREE === 'undefined') return null;

        const L = Math.abs(T.xFundo - T.xBoca);
        const xc = (T.xBoca + T.xFundo) / 2;
        const W = T.largura, H = T.alturaPassagem, t = T.espessuraParede;
        const g = new THREE.Group();
        g.name = 'tunel_jogadores';

        const mat = (cor, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.9 }, extra || {}));
        const caixa = (dx, dy, dz, x, y, z, m, sombra) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(dx, dy, dz), m);
            mesh.position.set(x, y, z);
            mesh.castShadow = !!sombra;
            mesh.receiveShadow = false;
            g.add(mesh);
            return mesh;
        };

        // Chao (um dedo acima do relvado: nao briga com ele no teste de profundidade).
        caixa(L, 0.06, W, xc, 0.04, 0, mat(T.cores.chao), false);
        // Paredes e tecto.
        const hP = H + 0.3;
        caixa(L, hP, t, xc, hP / 2, W / 2 + t / 2, mat(T.cores.parede), true);
        caixa(L, hP, t, xc, hP / 2, -(W / 2 + t / 2), mat(T.cores.parede), true);
        caixa(L, 0.3, W + 2 * t, xc, H + 0.15, 0, mat(T.cores.tecto), true);
        // Fundo escuro, a frente da face do degrau que fecha o corredor.
        caixa(0.1, H, W, T.xFundo - T.lado * 0.05, H / 2, 0,
            new THREE.MeshBasicMaterial({ color: T.cores.fundo }), false);
        // A luz do tecto: faixa emissiva (nao ilumina nada, mas le-se como iluminacao).
        caixa(L - 0.6, 0.04, 0.5, xc, H - 0.03, 0,
            new THREE.MeshBasicMaterial({ color: 0xfff1c9 }), false);

        grupo.add(g);
        return g;
    }
};
if (typeof window !== 'undefined') window.Tunel = Tunel;
