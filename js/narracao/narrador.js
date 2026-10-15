/*
=============================================================================
O NARRADOR — transforma os eventos do 3D em texto
=============================================================================
Lê os eventos de js/narracao/eventos.js e devolve frases em português do Brasil, com o minuto, o jogador e o
contexto (placar, cartão anterior, quem deu o passe). Substitui as frases pré-ajustadas do `simulateMatch` do manager:
agora a frase nasce do lance que aconteceu no jogo.

Variedade: cada tipo de lance tem várias frases e o narrador não repete a mesma duas vezes seguidas. O sorteio usa
`Math.random` (no simulador sem tela a semente está fixa por jogo, por isso o relato de um jogo é reproduzível).

`Narrador.linha(ev)` devolve { minuto, tipo, texto, equipa, jogadores, importante } ou null (lance sem texto).
`Narrador.relato(lista)` devolve as linhas de uma lista de eventos. `Narrador.nomeDaEquipa(team)` usa os nomes da partida.
=============================================================================
*/
const Narrador = {
    _ultima: {},   // tipo -> índice da última frase usada

    // Nome de cada equipa na partida em curso (A = casa).
    nomeDaEquipa(team) {
        if (typeof Match === 'undefined') return team === 'TeamA' ? 'casa' : 'visitante';
        const info = (team === 'TeamA') ? Match.equipaInfoA : Match.equipaInfoB;
        return (info && info.nome) ? String(info.nome).replace(/-[A-Z]{2}$/, '') : (team === 'TeamA' ? 'Casa' : 'Visitante');
    },

    _escolher(chave, opcoes) {
        let i = Math.floor(Math.random() * opcoes.length);
        if (opcoes.length > 1 && i === this._ultima[chave]) i = (i + 1) % opcoes.length;
        this._ultima[chave] = i;
        return opcoes[i];
    },

    _n(j) { return j ? j.nome : 'o jogador'; },
    _sobrenome(j) { if (!j || !j.nome) return 'o jogador'; const p = String(j.nome).trim().split(/\s+/); return p[p.length - 1]; },

    linha(ev) {
        if (!ev) return null;
        const eq = this.nomeDaEquipa(ev.equipa);
        const adv = this.nomeDaEquipa(ev.equipa === 'TeamA' ? 'TeamB' : 'TeamA');
        const j = ev.jogador, nome = this._n(j), sob = this._sobrenome(j);
        let texto = null, importante = false, jogadores = [];
        switch (ev.tipo) {
            case 'INICIO':
                texto = this._escolher('inicio', ['Começa o jogo!', 'Bola rolando!', 'Apita o árbitro e começa a partida.']);
                break;
            case 'INTERVALO':
                texto = this._escolher('intervalo', ['Fim do primeiro tempo.', 'O árbitro apita: é intervalo.']);
                if (ev.placar) texto += ' ' + this._placar(ev.placar);
                importante = true;
                break;
            case 'SEGUNDO_TEMPO':
                texto = this._escolher('segundo', ['Começa o segundo tempo!', 'Bola rolando para a etapa final.']);
                break;
            case 'FIM':
                texto = this._escolher('fim', ['Fim de jogo!', 'Termina a partida.']);
                if (ev.placar) texto += ' ' + this._placar(ev.placar);
                importante = true;
                break;
            case 'REMATE': {
                // Só narra o remate quando o desfecho já se conhece (as linhas do desfecho dizem o resto).
                if (!ev.desfecho || ev.desfecho === 'golo' || ev.desfecho === 'defesa') return null;
                jogadores = [j];
                if (ev.desfecho === 'bloqueado') {
                    texto = this._escolher('bloq', [
                        sob + ' chuta e a zaga bloqueia!', nome + ' tenta o chute, mas a defesa travou.',
                        'Chute de ' + sob + ' é bloqueado.']);
                } else {
                    const perigo = (ev.xg || 0) > 0.18;
                    texto = perigo
                        ? this._escolher('foraP', [sob + ' chuta com perigo e a bola passa ao lado!', 'Quase! ' + sob + ' manda a bola para fora por pouco.', 'Que chance desperdiçada por ' + sob + '!'])
                        : this._escolher('foraL', [sob + ' arrisca de longe e a bola vai para fora.', 'Chute de ' + sob + ' sem direção.', nome + ' tenta, mas não acerta o alvo.']);
                }
                break;
            }
            case 'DEFESA': {
                jogadores = [j, ev.rematador];
                const chut = ev.rematador ? this._sobrenome(ev.rematador) : 'o atacante';
                texto = this._escolher('defesa', [
                    'Defesa de ' + sob + '! O chute de ' + chut + ' ia no canto.', sob + ' espalma e salva o ' + eq + '!',
                    'Grande defesa do goleiro ' + sob + '!', sob + ' se estica todo e evita o gol.']);
                importante = true;
                break;
            }
            case 'GOLO': {
                jogadores = [j, ev.assistente];
                if (ev.proprioGolo) {
                    texto = 'GOL CONTRA! ' + nome + ' desvia para a própria rede. ' + eq + ' marca! ' + this._placar(ev.placar);
                } else {
                    const ass = ev.assistente ? this._escolher('ass', [' Passe de ' + this._sobrenome(ev.assistente) + '.', ' Assistência de ' + this._sobrenome(ev.assistente) + '.']) : '';
                    texto = this._escolher('golo', [
                        'GOOOL! ' + nome + ' balança a rede para o ' + eq + '!', 'É GOL! ' + nome + ' não perdoa!',
                        'GOOOOL DO ' + eq.toUpperCase() + '! ' + nome + ' marca!']) + ass + ' ' + this._placar(ev.placar);
                }
                importante = true;
                break;
            }
            case 'FALTA': {
                jogadores = [j, ev.vitima];
                if (ev.cartao === 'vermelho') {
                    texto = ev.segundoAmarelo
                        ? '🟥 Segundo amarelo e expulsão de ' + nome + ' (' + eq + ')!'
                        : '🟥 Cartão vermelho direto para ' + nome + ' (' + eq + ')!';
                    importante = true;
                } else if (ev.cartao === 'amarelo') {
                    texto = '🟨 ' + this._escolher('am', ['Cartão amarelo para ' + nome + '.', nome + ' é advertido pelo árbitro.']) + ' (' + eq + ')';
                    importante = true;
                } else if (Math.random() < 0.55) {
                    texto = this._escolher('falta', ['Falta de ' + sob + (ev.vitima ? ' em ' + this._sobrenome(ev.vitima) : '') + '.', 'O árbitro marca falta do ' + eq + '.', sob + ' derruba o adversário e o juiz apita.']);
                }
                break;
            }
            case 'CANTO':
                texto = this._escolher('canto', ['Escanteio para o ' + eq + '.', 'Bola para fora, escanteio do ' + eq + '.', eq + ' vai cobrar o escanteio.']);
                break;
            case 'IMPEDIMENTO':
                texto = this._escolher('imp', ['Impedimento do ' + eq + '! O bandeirinha levanta a bandeira.', 'Bandeira levantada: o ' + eq + ' estava adiantado.']);
                break;
            case 'PENALTI':
                texto = 'PÊNALTI para o ' + eq + '!' + (j ? ' ' + nome + ' vai para a cobrança.' : '');
                importante = true;
                jogadores = [j];
                break;
            default:
                return null;
        }
        if (!texto) return null;
        return { minuto: ev.minuto, tipo: ev.tipo, equipa: ev.equipa, texto: texto, jogadores: jogadores.filter(Boolean), importante: importante, n: ev.n };
    },

    _placar(p) {
        if (!p) return '';
        return this.nomeDaEquipa('TeamA') + ' ' + p.A + ' x ' + p.B + ' ' + this.nomeDaEquipa('TeamB') + '.';
    },

    relato(lista) {
        const out = [];
        for (const ev of lista) {
            const l = this.linha(ev);
            if (l) out.push(l);
        }
        return out;
    }
};
if (typeof window !== 'undefined') window.Narrador = Narrador;
