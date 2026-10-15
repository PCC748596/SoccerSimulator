/*
=============================================================================
O REGISTO DE EVENTOS DA PARTIDA — a base da narração
=============================================================================
Pedido: o simulador 3D decide a partida e a narração sai DO QUE ACONTECE no 3D (e não de eventos pré-ajustados, como no
`simulateMatch` do manager). Isto guarda, por ordem, cada lance que conta, com o MINUTO do relógio de jogo e os
jogadores envolvidos; o narrador (js/narracao/narrador.js) transforma-os em frases e o manager lê-os pela ponte
(js/narracao/ponte.js).

Cada evento: { n, minuto, segundos, tipo, equipa, jogador, jogador2, ... }:

  REMATE     jogador (quem rematou), xg, desfecho preenchido depois: 'golo' | 'defesa' | 'bloqueado' | 'fora'
  GOLO       jogador (autor), assistente (se houve), proprioGolo, placar
  DEFESA     jogador (o guarda-redes), rematador
  FALTA      jogador (infractor), vitima, cartao: null | 'amarelo' | 'vermelho'
  CARTAO     jogador, cor ('amarelo' | 'vermelho'), segundoAmarelo
  CANTO      equipa (a que bate)
  LATERAL    equipa
  TIRO_META  equipa
  IMPEDIMENTO jogador? , equipa
  PENALTI    jogador (batedor), equipa
  INICIO / INTERVALO / SEGUNDO_TEMPO / FIM    marcos do jogo

O \`minuto\` e o do RELÓGIO do jogo (Match.tempoDeJogo, que já anda MatchDuration.timeScale vezes mais depressa que a
simulação), 1-based: um lance aos 0:30 e do minuto 1.
=============================================================================
*/
const Eventos = {
    lista: [],
    _n: 0,
    ultimoRemate: null,
    _defContadas: { TeamA: 0, TeamB: 0 },
    ativo: true,
    ouvintes: [],

    reset() {
        this.lista.length = 0;
        this._n = 0;
        this.ultimoRemate = null;
        this._defContadas = { TeamA: 0, TeamB: 0 };
    },

    // Quem quiser os eventos em tempo real regista aqui uma função (ev) => ...
    aoRegistar(fn) { if (typeof fn === 'function') this.ouvintes.push(fn); },

    _minuto() {
        const seg = (typeof Match !== 'undefined' && typeof Match.tempoDeJogo === 'number') ? Match.tempoDeJogo : 0;
        return { segundos: seg, minuto: Math.floor(seg / 60) + 1 };
    },

    // Os dados de um jogador, para o manager o ligar ao dele: id do elenco, nome, posição e equipa.
    _jog(p) {
        if (!p) return null;
        const sk = p.skills || {};
        return { id: (sk.id !== undefined ? sk.id : null), nome: sk.nome || ('Jogador ' + p.id), pos: p.pos, equipa: p.team, numero: sk.numero };
    },

    registar(tipo, dados) {
        if (!this.ativo) return null;
        const t = this._minuto();
        const ev = Object.assign({ n: ++this._n, minuto: t.minuto, segundos: t.segundos, tipo: tipo }, dados || {});
        this.lista.push(ev);
        this._notificar(ev);
        return ev;
    },

    _notificar(ev) {
        for (const f of this.ouvintes) { try { f(ev); } catch (e) { /* um ouvinte nao parte o jogo */ } }
    },

    // O ultimo remate ainda sem desfecho recebe-o (golo, defesa, bloqueado); a bola que sai sem tocar em ninguem e 'fora'.
    fecharRemate(desfecho, extra) {
        const r = this.ultimoRemate;
        if (!r || r.desfecho) return null;
        r.desfecho = desfecho;
        if (extra) Object.assign(r, extra);
        // Quem ouve em tempo real recebe o REMATE de novo, agora com o desfecho (ev.n e o mesmo).
        this._notificar(r);
        return r;
    },

    // Chamado uma vez por frame de jogo: um remate sem desfecho ha mais de 6 s de simulacao saiu para fora.
    varrer(dt) {
        const r = this.ultimoRemate;
        if (r && !r.desfecho) {
            r._idade = (r._idade || 0) + dt;
            if (r._idade > 6.0) { r.desfecho = 'fora'; this._notificar(r); }
        }
    },

    // ---- os pontos de emissao (chamados do motor; todos tolerantes a ausencia deste ficheiro) --------------------
    remate(p, xg) {
        const r = this.registar('REMATE', { equipa: p.team, jogador: this._jog(p), xg: xg, desfecho: null, _idade: 0 });
        if (r) this.ultimoRemate = r;
        return r;
    },
    golo(marcou, autor, assistente, proprioGolo) {
        this.fecharRemate('golo');
        return this.registar('GOLO', {
            equipa: marcou, jogador: this._jog(autor), assistente: this._jog(assistente), proprioGolo: !!proprioGolo,
            placar: { A: Match.placarA, B: Match.placarB }
        });
    },
    defesa(gk) {
        // So conta a defesa que o MatchStats conta (um remate da outra equipa a caminho, consumido): o gesto de maos e o mergulho
        // passam aqui varias vezes por lance e tambem apanham cruzamentos e passes atrasados.
        const est = (typeof MatchStats !== 'undefined') ? MatchStats[gk.team] : null;
        if (est) {
            const n = est.defesas || 0;
            if (n <= (this._defContadas[gk.team] || 0)) return null;
            this._defContadas[gk.team] = n;
        }
        const r = this.ultimoRemate;
        this.fecharRemate('defesa', { guardaRedes: this._jog(gk) });
        return this.registar('DEFESA', { equipa: gk.team, jogador: this._jog(gk), rematador: r ? r.jogador : null });
    }
};
if (typeof window !== 'undefined') window.Eventos = Eventos;

/*
LIGACAO AO MOTOR. Os eventos que o EventBus ja emite (falta/cartao e as mudancas de estado) entram aqui; os outros
(remate, golo, defesa, canto, impedimento) sao registados nos pontos do motor onde acontecem.
*/
(function ligar() {
    if (typeof EventBus === 'undefined') return;
    EventBus.on('FOUL', (d) => {
        const inf = d.infractor, vit = d.vitima;
        Eventos.registar('FALTA', {
            equipa: inf ? inf.team : null, jogador: Eventos._jog(inf), vitima: Eventos._jog(vit), cartao: d.cartao || null,
            segundoAmarelo: !!(d.cartao === 'vermelho' && inf && inf.temAmarelo)
        });
    });
    EventBus.on('PENALTY_TAKEN', (d) => {
        const p = d && (d.batedor || d.player || d.p);
        Eventos.registar('PENALTI', { equipa: p ? p.team : null, jogador: Eventos._jog(p) });
    });
    EventBus.on('MATCH_STATE_CHANGE', (d) => {
        const placar = (typeof Match !== 'undefined') ? { A: Match.placarA, B: Match.placarB } : null;
        if (d.motivo === 'intervalo') Eventos.registar('INTERVALO', { placar: placar });
        else if (d.motivo === 'segundo_tempo') Eventos.registar('SEGUNDO_TEMPO', {});
        else if (d.motivo === 'apito_final') Eventos.registar('FIM', { placar: placar });
    });
})();
