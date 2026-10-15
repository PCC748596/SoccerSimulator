/*
=============================================================================
A PONTE — o simulador 3D como motor de partida de outro jogo (o Football Manager)
=============================================================================
Esta página (index.html?embutido=1) pode ser aberta dentro de um iframe do manager. O manager manda UMA mensagem para a iniciar e recebe
de volta, por `postMessage`, os eventos da partida já narrados e, no fim, o resultado. Dois modos de apresentação, um só motor:

  modo 'oculto'   o iframe fica escondido (ou pequeno). A partida corre SEM desenhar nada, como nos lotes (Sim.running), a um ritmo que
                  o manager escolhe: 'real' (1 s de simulação por segundo real = 90 min de relógio em ~20 min, que é o ritmo do manager)
                  ou 'maximo' (o mais depressa possível, para saltar para o resultado). É o "simulador 2D" do manager: só a narração.
  modo 'visivel'  o iframe mostra o jogo em 3D (câmaras, bancadas, etc.), com o ritmo normal do jogo; os mesmos eventos saem na mesma.

MENSAGENS (o manager -> a ponte), todas com { para: 'simulador3d', tipo, ... }:
  iniciar    { casa, fora, modo, ritmo, velocidade, taticaDe, fimEmMinutos }   casa/fora: { equipa, jogadoresPorId, formacao: { nome, slots } }
             (o formato do AdaptadorManager.prepararPartida; ver js/narracao/adaptador_manager.js)
  pausar / continuar / parar
  velocidade { valor }      multiplica o ritmo (modo oculto 'real': 1, 2, 4...; no visivel, o speedMultiplier do jogo)

MENSAGENS (a ponte -> o manager), todas com { fonte: 'simulador3d', tipo, ... }:
  pronto                       a página carregou e o motor está pronto
  iniciada   { minuto }        a partida arrancou
  evento     { evento, linha } um lance (ver Eventos); `linha` e o texto narrado ({ minuto, texto, importante, ... }) ou null
  estado     { minuto, placar, posse }    de 5 em 5 minutos de relógio
  fim        { resultado }     o resultado (ver `resultado()`): placar, posse, estatisticas, golos, cartoes, eventos e relato completos
  erro       { mensagem }
=============================================================================
*/
const Ponte = {
    estado: 'parado',          // 'parado' | 'a_correr' | 'pausado' | 'terminado'
    modo: 'oculto',
    ritmo: 'real',
    velocidade: 1,
    fimEmMinutos: 90,
    _timer: null,
    _ultimoTempo: 0,
    _ultimoEstado: -1,
    _linhasEnviadas: 0,
    _enviados: new Set(),
    // Para onde vao as mensagens: por omissao o `parent` (o manager); os testes substituem-no.
    saida: function (msg) {
        const alvo = (typeof window !== 'undefined' && window.parent && window.parent !== window) ? window.parent : null;
        if (alvo) alvo.postMessage(msg, '*');
    },

    enviar(tipo, dados) { this.saida(Object.assign({ fonte: 'simulador3d', tipo: tipo }, dados || {})); },

    aoMensagem(m) {
        if (!m || m.para !== 'simulador3d') return;
        try {
            if (m.tipo === 'iniciar') this.iniciar(m);
            else if (m.tipo === 'preparar') this.preparar(m);
            else if (m.tipo === 'pausar') this.pausar();
            else if (m.tipo === 'continuar') this.continuar();
            else if (m.tipo === 'parar') this.parar();
            else if (m.tipo === 'velocidade') this.definirVelocidade(m.valor);
        } catch (e) {
            this.enviar('erro', { mensagem: String(e && e.message || e) });
        }
    },

    // So monta as equipas no campo (para o 3D mostrar os times certos antes da saida); nao arranca a partida.
    // No modo visivel a ENTRADA DOS TIMES corre ja aqui (ao abrir o 3D) e os times esperam alinhados pela saida (`iniciar`).
    preparar(m) {
        AdaptadorManager.prepararPartida(m.casa, m.fora, { taticaDe: m.taticaDe || 'casa', escala: m.escala });
        this._preparada = this._chave(m);
        this._medir();
        // O som do estadio e do publico (desligado por omissao no jogo solto) liga-se: o clique do utilizador no manager desbloqueia-o (iframe allow=autoplay).
        if (typeof AmbienteSonoro !== 'undefined' && AmbienteSonoro.setLigado) { AmbienteSonoro.setLigado(true); if (AmbienteSonoro.tentarTocar) AmbienteSonoro.tentarTocar(); }
        if (typeof Sim === 'undefined') global_Sim();
        Sim.running = false;
        if (typeof Abertura !== 'undefined') {
            Abertura.aguardarSaida = false; Match.segurarSaida = true; Abertura.jaCorreu = false; Abertura.activa = false;
            window.isPaused = false;
            Abertura.iniciar();
        }
    },
    /*
    MEDIDOR DE DESEMPENHO (so no browser, modo visivel): de 2 em 2 s envia { fps, msJogo } — os quadros por segundo e o tempo medio que
    o Match.update gasta por quadro. fps baixo com msJogo baixo = o peso e o desenho (GPU); msJogo alto = e a logica do jogo.
    */
    _medir() {
        if (this._medidor || (typeof process !== 'undefined' && process.versions && process.versions.node) || typeof requestAnimationFrame !== 'function' || /jsdom/i.test((navigator && navigator.userAgent) || '')) return;
        this._medidor = true;
        const orig = Match.update.bind(Match);
        let acc = 0, n = 0, quadros = 0, t0 = performance.now();
        Match.update = function (dt) { const a = performance.now(); orig(dt); acc += performance.now() - a; n++; };
        const volta = () => {
            quadros++;
            const t = performance.now();
            if (t - t0 >= 2000) {
                Ponte.enviar('perf', { fps: Math.round(quadros * 1000 / (t - t0)), msJogo: n ? Math.round(acc / n * 10) / 10 : 0, passosPorQuadro: Math.round(n / Math.max(1, quadros) * 10) / 10 });
                acc = 0; n = 0; quadros = 0; t0 = t;
            }
            requestAnimationFrame(volta);
        };
        requestAnimationFrame(volta);
    },
    _chave(m) { return m.casa.equipa.name + '|' + m.fora.equipa.name; },

    iniciar(m) {
        this.parar();
        this.modo = (m.modo === 'visivel') ? 'visivel' : 'oculto';
        this.ritmo = (m.ritmo === 'maximo') ? 'maximo' : 'real';
        this.velocidade = (typeof m.velocidade === 'number' && m.velocidade > 0) ? m.velocidade : 1;
        this.fimEmMinutos = (typeof m.fimEmMinutos === 'number' && m.fimEmMinutos > 0) ? m.fimEmMinutos : 90;
        this._enviados = new Set();
        this._ultimoEstado = -1;

        // A partida no motor: elencos, escalacao, formacoes e tatica.
        // Se o `preparar` ja montou esta partida (e a entrada dos times esta a correr), nao se refaz nada: so se solta a espera.
        const jaPreparada = (this.modo === 'visivel' && this._preparada === this._chave(m));
        if (!jaPreparada) AdaptadorManager.prepararPartida(m.casa, m.fora, { taticaDe: m.taticaDe || 'casa', escala: m.escala });
        this._preparada = null;
        if (typeof Abertura !== 'undefined') Abertura.aguardarSaida = false;
        Match.segurarSaida = false;
        MatchStats.reset();
        Match.tempoDeJogo = 0; Match.placarA = 0; Match.placarB = 0;
        Match.primeiroTempoAcabou = false;
        Eventos.reset();
        if (!this._ouvinte) {
            this._ouvinte = (ev) => this._aoEvento(ev);
            Eventos.aoRegistar(this._ouvinte);
        }

        // O modo decide quem conduz o tick: o lote (oculto, sem desenhar) ou o animate (visivel).
        if (typeof Sim === 'undefined') global_Sim();
        Sim.running = (this.modo === 'oculto');
        if (this.modo === 'visivel') window.isPaused = false;
        if (this.modo === 'visivel' && typeof window !== 'undefined') window.speedMultiplier = this.velocidade;
        window.comemoracaoNaSimulacao = false;

        this.estado = 'a_correr';
        this.enviar('iniciada', { minuto: 1 });
        Eventos.registar('INICIO', {});
        // No modo visivel as equipas entram pelo tunel (js/abertura.js) antes da saida de bola, como no jogo normal; o relogio so corre depois.
        if (this.modo === 'visivel' && !jaPreparada && typeof Abertura !== 'undefined') { Abertura.jaCorreu = false; Abertura.activa = false; Abertura.iniciar(); }
        if (this.modo === 'oculto') this._arrancarCiclo();
        else this._arrancarVigia();
    },

    pausar() {
        if (this.estado !== 'a_correr') return;
        this.estado = 'pausado';
        if (this.modo === 'visivel') window.isPaused = true;
    },
    continuar() {
        if (this.estado !== 'pausado') return;
        this.estado = 'a_correr';
        this._ultimoTempo = this._agora();
        if (this.modo === 'visivel') window.isPaused = false;
    },
    parar() {
        if (this._timer) { clearTimeout(this._timer); clearInterval(this._timer); this._timer = null; }
        if (this.estado !== 'terminado') this.estado = 'parado';
    },
    definirVelocidade(v) {
        if (!(v > 0)) return;
        this.velocidade = v;
        if (this.modo === 'visivel' && typeof window !== 'undefined') window.speedMultiplier = v;
    },

    // Date.now e nao performance.now: o harness de testes (jsdom) tem um performance.now que recursa.
    _agora() { return Date.now(); },

    /*
    O CICLO DO MODO OCULTO. Passos de 1/60 s (os mesmos do lote, que e o que esta calibrado). No ritmo 'real' o numero de passos
    por volta do temporizador sai do tempo real que passou (com um tecto, para um separador em segundo plano nao dar mil passos
    de uma vez); no 'maximo' faz um bloco grande por volta e devolve o controlo (para a pagina nao congelar).
    */
    _arrancarCiclo() {
        this._ultimoTempo = this._agora();
        const volta = () => {
            if (this.estado === 'terminado' || this.estado === 'parado') return;
            if (this.estado === 'pausado') { this._timer = setTimeout(volta, 100); return; }
            let passos;
            if (this.ritmo === 'maximo') passos = 600;
            else {
                const agora = this._agora();
                passos = Math.min(120, Math.floor(((agora - this._ultimoTempo) / 1000) * 60 * this.velocidade));
                if (passos > 0) this._ultimoTempo += (passos / (60 * this.velocidade)) * 1000;
            }
            const dt = 1 / 60;
            try {
                for (let i = 0; i < passos; i++) {
                    Match.update(dt);
                    if (this._acabou()) { this._terminar(); return; }
                }
            } catch (e) { this.enviar('erro', { mensagem: String(e && e.message || e) }); this.estado = 'parado'; return; }
            this._estadoPeriodico();
            this._timer = setTimeout(volta, this.ritmo === 'maximo' ? 0 : 25);
        };
        this._timer = setTimeout(volta, 0);
    },

    // No modo visivel quem conduz e o animate() do jogo; aqui so se vigia o fim.
    _arrancarVigia() {
        this._timer = setInterval(() => {
            if (this.estado !== 'a_correr') return;
            this._estadoPeriodico();
            if (this._acabou()) this._terminar();
        }, 500);
    },

    _acabou() {
        if (Match.state === 'FIM_DE_JOGO') return true;
        return Match.primeiroTempoAcabou && Match.tempoDeJogo >= this.fimEmMinutos * 60;
    },

    _aoEvento(ev) {
        // O REMATE chega duas vezes (ao ser registado e ao fechar com o desfecho): o narrador so escreve a segunda; as outras uma vez.
        const linha = Narrador.linha(ev);
        const chave = ev.n + ':' + (ev.desfecho || '');
        if (this._enviados.has(chave)) return;
        this._enviados.add(chave);
        if (!linha && ev.tipo !== 'REMATE') return;
        if (ev.tipo === 'REMATE' && !linha && !ev.desfecho) return;
        this.enviar('evento', { evento: this._limpar(ev), linha: linha });
    },

    // Um evento so com dados simples (sem referencias ao motor), para viajar por mensagem.
    _limpar(ev) { return JSON.parse(JSON.stringify(ev, (k, v) => (k === '_idade' ? undefined : v))); },

    _estadoPeriodico() {
        const min = Math.floor(Match.tempoDeJogo / 60);
        if (min === this._ultimoEstado) return;
        this._ultimoEstado = min;
        const posseA = MatchStats.TeamA.posseSegundos || 0, posseB = MatchStats.TeamB.posseSegundos || 0;
        this.enviar('estado', { minuto: Math.floor(Match.tempoDeJogo / 60) + 1, placar: { casa: Match.placarA, fora: Match.placarB },
            posse: { casa: posseA + posseB > 0 ? posseA / (posseA + posseB) : 0.5 } });
    },

    _terminar() {
        if (this.estado === 'terminado') return;
        this.parar();
        this.estado = 'terminado';
        Eventos.registar('FIM', { placar: { A: Match.placarA, B: Match.placarB } });
        this.enviar('fim', { resultado: this.resultado() });
        if (this.modo === 'oculto') Sim.running = false;
    },

    /*
    O RESULTADO que o manager grava no Fixture: placar, posse, as estatisticas completas (MatchStats.resumo + porJogo), os gols e os
    cartoes por jogador, e o registo e o relato completos.
    */
    resultado() {
        const A = MatchStats.TeamA, B = MatchStats.TeamB;
        const posseT = (A.posseSegundos || 0) + (B.posseSegundos || 0);
        const L = Eventos.lista;
        const golos = L.filter(e => e.tipo === 'GOLO').map(e => ({
            minuto: e.minuto, equipa: e.equipa === 'TeamA' ? 'casa' : 'fora', jogador: e.jogador, assistente: e.assistente, proprioGolo: !!e.proprioGolo }));
        const cartoes = L.filter(e => e.tipo === 'FALTA' && e.cartao).map(e => ({
            minuto: e.minuto, equipa: e.equipa === 'TeamA' ? 'casa' : 'fora', jogador: e.jogador, cor: e.cartao, segundoAmarelo: !!e.segundoAmarelo }));
        return {
            placar: { casa: Match.placarA, fora: Match.placarB },
            posse: { casa: posseT > 0 ? Math.round(1000 * (A.posseSegundos || 0) / posseT) / 10 : 50, fora: posseT > 0 ? Math.round(1000 * (B.posseSegundos || 0) / posseT) / 10 : 50 },
            estatisticas: this._limpar(MatchStats.resumo()),
            golos: golos, cartoes: cartoes,
            eventos: this._limpar({ l: L }).l.map((e, i) => { const ln = Narrador.linha(L[i]); e.texto = ln ? ln.texto : null; return e; }),
            relato: Narrador.relato(L)
        };
    }
};
function global_Sim() { if (typeof window !== 'undefined') window.Sim = {}; else global.Sim = {}; }
if (typeof window !== 'undefined') {
    window.Ponte = Ponte;
    window.addEventListener('message', (e) => Ponte.aoMensagem(e.data));
    // Avisa o manager quando o motor estiver pronto (a inicializacao do jogo e assincrona).
    const avisar = () => {
        if (typeof Match !== 'undefined' && Match.players && Match.players.length > 0) Ponte.enviar('pronto', {});
        else setTimeout(avisar, 200);
    };
    if (typeof document !== 'undefined' && document.readyState !== 'loading') setTimeout(avisar, 0);
    else window.addEventListener('DOMContentLoaded', () => setTimeout(avisar, 0));
}
