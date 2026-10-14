/*
=============================================================================
TEMPO POR CORREDOR — a medida e o empurrao (config em config/balanco_corredores.js)
=============================================================================
Guarda, por equipa, que fraccao do tempo de POSSE foi passada em cada corredor (esq / cen / dir, no referencial de
ataque da equipa) numa media exponencial de `janela` s, e diz, para um corredor, o quanto a equipa esta acima ou
abaixo do alvo que o treinador pediu (os botoes Left / Center / Right). Ver o ficheiro de config para o modelo.

`tick` corre uma vez por frame de jogo (Match.update); `ajusteDePasse` e lido pelo `findPassTarget` (player.js) e
`resumo` serve o relatorio. Sem equipa a ter a bola (jogo parado, bola no ar sem dono) o tempo nao conta.
=============================================================================
*/
const TempoPorCorredor = {
    _est: null,

    _novo() {
        const a = this.alvo();
        return { atual: 'cen', fatia: { esq: a.esq, cen: a.cen, dir: a.dir }, acum: { esq: 0, cen: 0, dir: 0 }, total: 0 };
    },

    reset() { this._est = { TeamA: this._novo(), TeamB: this._novo() }; },

    _de(team) {
        if (!this._est) this.reset();
        return this._est[team] || (this._est[team] = this._novo());
    },

    // O alvo pelos corredores ligados em `Tatics.setores` (0, 1 ou 2; tres ligados e o mesmo que nenhum).
    alvo(setores) {
        const C = BalancoCorredores;
        const s = setores || ((typeof Tatics !== 'undefined' && Tatics.setores) ? Tatics.setores : []);
        const n = s.length;
        const r = {};
        if (n === 0 || n >= 3) {
            for (const k of ['esq', 'cen', 'dir']) r[k] = C.alvoSemLigados;
        } else if (n === 1) {
            for (const k of ['esq', 'cen', 'dir']) r[k] = (s.indexOf(k) >= 0) ? C.alvoUmLigado.ligado : C.alvoUmLigado.outros;
        } else {
            for (const k of ['esq', 'cen', 'dir']) r[k] = (s.indexOf(k) >= 0) ? C.alvoDoisLigados.ligados : C.alvoDoisLigados.resto;
        }
        return r;
    },

    _corte() {
        const C = BalancoCorredores;
        return (typeof C.corteX === 'number') ? C.corteX : (typeof CAMPO_LARG === 'number' ? CAMPO_LARG : 68) / 6;
    },

    // O corredor de um x (referencial de ataque), SEM histerese: para quem nao tem estado.
    corredorDeX(xAtk) {
        const c = this._corte();
        return xAtk < -c ? 'esq' : (xAtk > c ? 'dir' : 'cen');
    },

    // O corredor de uma bola em xAtk, com histerese em relacao ao que estava.
    _corredorComHisterese(atual, xAtk) {
        const c = this._corte(), h = BalancoCorredores.histerese;
        // So se muda depois de passar o corte por `h` m.
        if (atual === 'esq') { if (xAtk > -c + h) return xAtk > c + h ? 'dir' : 'cen'; return 'esq'; }
        if (atual === 'dir') { if (xAtk < c - h) return xAtk < -c - h ? 'esq' : 'cen'; return 'dir'; }
        if (xAtk < -c - h) return 'esq';
        if (xAtk > c + h) return 'dir';
        return 'cen';
    },

    // Uma vez por frame de jogo.
    tick(dt) {
        const C = BalancoCorredores;
        if (typeof Match === 'undefined' || !Match.ball || Match.state !== 'PLAY') return;
        const team = Match.possessionTeam;
        if (team !== 'TeamA' && team !== 'TeamB') return;
        const lista = (team === 'TeamA') ? Match.players : Match.opponents;
        if (!lista || !lista[0]) return;
        const dirZ = lista[0].dirZ || 1;
        const e = this._de(team);
        const xAtk = Match.ball.position.x * dirZ;
        e.atual = this._corredorComHisterese(e.atual, xAtk);
        const alfa = 1 - Math.exp(-dt / Math.max(1, C.janela));
        for (const k of ['esq', 'cen', 'dir']) e.fatia[k] += ((k === e.atual ? 1 : 0) - e.fatia[k]) * alfa;
        e.acum[e.atual] += dt;
        e.total += dt;
    },

    // Fraccao actual (janela) e alvo de um corredor, e o desvio (+ = acima do alvo).
    estado(team, corredor) {
        const e = this._de(team), a = this.alvo();
        return { fatia: e.fatia[corredor], alvo: a[corredor], desvio: e.fatia[corredor] - a[corredor] };
    },

    /*
    O EMPURRAO de um corredor, -1..+1: 0 dentro da margem; acima do alvo + margem, sobe ate +1 (a equipa jogou
    demais ali); abaixo do alvo - margem, desce ate -1 (falta tempo ali).
    */
    empurrao(team, corredor) {
        const C = BalancoCorredores;
        const d = this.estado(team, corredor).desvio;
        const ex = Math.abs(d) - C.margem;
        if (ex <= 0) return 0;
        return Math.sign(d) * Math.min(1, ex / Math.max(1e-6, C.escala));
    },

    // Pontos a somar a nota de um passe cujo DESTINO esta em xAtk: sobe onde falta tempo, desce onde sobra.
    ajusteDePasse(team, xAtkDestino) {
        const C = BalancoCorredores;
        if (!C.activo) return 0;
        return -C.pontosPasse * this.empurrao(team, this.corredorDeX(xAtkDestino));
    },

    resumo(team) {
        const e = this._de(team);
        const t = Math.max(1e-6, e.total);
        return { esq: e.acum.esq / t, cen: e.acum.cen / t, dir: e.acum.dir / t, segundos: e.total,
            janela: { esq: e.fatia.esq, cen: e.fatia.cen, dir: e.fatia.dir } };
    }
};
if (typeof window !== 'undefined') window.TempoPorCorredor = TempoPorCorredor;
