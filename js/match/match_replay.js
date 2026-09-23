/*
12 SEGUNDOS a 60 fps, e é isso que dura uma repeticao.

Eram 20 s de buffer com a repeticao do golo a mostrar 16 (15 antes da bola
entrar mais 1 depois). Pedido: *"Ajusta o Replay para 12segundos."*

Encolher AQUI chega para as duas repeticoes, e e por isso que se mexe aqui e
nao so no REPLAY_GOLO: a repeticao manual (o botao) corre o buffer inteiro, a
do golo recorta uma janela dentro dele. Com o buffer a 12 s as duas passam a
durar o mesmo.

Custa 1236 floats por frame (FLOATS_PER_FRAME), portanto o buffer passa de
5.9 MB para 3.6 MB.
*/
const REPLAY_FRAMES = 720; // 12s a 60fps
const FLOATS_PER_PLAYER = 49;

/*
=============================================================================
A ARBITRAGEM TAMBÉM ENTRA NO REPLAY
=============================================================================
Relato: *"o juiz e os bandeirinhas estão parados durante o replay"*.

E estavam: o buffer guardava a bola e VINTE E DOIS corpos, e mais nada. Durante
a repetição o `Match.update` não corre — é disso que vive o replay —, portanto
ninguém mexia o árbitro nem os assistentes: ficavam congelados na pose e no
sítio onde o jogo os deixou, no meio de vinte e dois bonecos a jogar.

São mais três corpos com o mesmo esqueleto dos jogadores (o `criarCorpo` dos
árbitros devolve um FootballPlayer inteiro, ver officials.js), portanto entram
no mesmo formato e pelo mesmo código. Custo: 3 x 49 floats por frame, ou seja
0.7 MB no buffer de 20 s.
=============================================================================
*/
const CORPOS_POR_FRAME = 25;   // 22 jogadores + árbitro + 2 assistentes
/*
7 da bola (posicao + quaterniao), 25 corpos, e 4 da REDE no fim — `t` e
`amplitude` da onda por cada baliza (ver NetWave.estado, js/goal_net.js).

Os 4 da rede vao no FIM de proposito: acrescentados a cabeca mudavam o offset
de tudo o que ja la estava, e este buffer e lido e escrito por indice a mao.
*/
const FLOATS_PER_REDE = 4;
const FLOATS_PER_FRAME = 7 + CORPOS_POR_FRAME * FLOATS_PER_PLAYER + FLOATS_PER_REDE;

/*
=============================================================================
O REPLAY AUTOMATICO DO GOLO
=============================================================================
Pedido: *"caso saia um gol, sera mostrado um replay na camera Lateral TV(7)
dos ultimos 15s antes do gol. A nova saida de bola so sera dada apos o replay
automatico terminar, caso esteja ligado"*.

Tres numeros e nada mais:

  `SEGUNDOS_ANTES`  quanto do lance se ve antes da bola entrar. Cabe no
                    buffer, que guarda 12 s (REPLAY_FRAMES) — e a soma com o
                    `SEGUNDOS_DEPOIS` tem de caber la dentro.
  `SEGUNDOS_DEPOIS` e quanto se ve DEPOIS: sem isto a repeticao acabava no
                    frame exacto em que a bola passa a linha, que e o unico
                    frame que ninguem quer perder.
  `CAMARA`          a Lateral TV, que e a vista de onde um golo se ve.

Como se prende a saida de bola: enquanto `isReplaying` estiver de pe o
`animate` (js/main.js) nao chama o `Match.update`, portanto a maquina de
estados do golo (`goalSequenceStage`, js/match/match_physics.js) fica
exactamente onde esta ate a repeticao acabar. Nao e preciso travao nenhum a
mais — e o mesmo travao que impede a simulacao de escrever nos corpos que a
repeticao esta a repor.
=============================================================================
*/
const REPLAY_GOLO = {
    SEGUNDOS_ANTES: 11.0,
    SEGUNDOS_DEPOIS: 1.0,
    CAMARA: 'lateraltv'
};

class ReplaySystem {
    constructor() {
        this.buffer = new Float32Array(REPLAY_FRAMES * FLOATS_PER_FRAME);
        this.head = 0;
        this.count = 0;
        this.isReplaying = false;
        this.replayCursor = 0;

        // Ligado por omissao, como pedido.
        this.automatico = true;
        // O frame em que a bola entrou, e onde a repeticao do golo acaba.
        this.marcaDoGolo = null;
        this.replayFim = null;
        // O que se devolve ao jogo quando a repeticao automatica acaba.
        this.camaraAnterior = null;
        this.eraAutomatico = false;
    }

    /*
    O BOTAO DO PAINEL. Desligar a meio de uma repeticao automatica corta-a — e
    o que o utilizador quer dizer com "off" enquanto esta a ver uma.
    */
    toggleAutomatico() {
        this.automatico = !this.automatico;
        if (!this.automatico && this.eraAutomatico) this.stopReplay();
        this.actualizarBotaoAutomatico();
        return this.automatico;
    }

    /*
    O AVISO DE REPETIÇÃO ao lado do placar — pedido: *"quando o Replay estiver
    rodando vamos colocar uma informação ao lado do placar. REPLAY com uma caixa
    retangular com bordas arredondadas, fundo amarelo, letras pretas. Piscando
    ao lado do placar"*.

    O piscar é da folha de estilo (`piscar-replay`, css/styles.css); daqui só se
    acende e se apaga. Serve as duas repetições, a manual e a do golo: o que se
    quer saber ao olhar para o ecrã é que aquilo não é o jogo a sério.
    */
    actualizarAvisoDeReplay() {
        const el = document.getElementById('aviso-replay');
        if (el) el.hidden = !this.isReplaying;
    }

    actualizarBotaoAutomatico() {
        const el = document.getElementById('btn-replay-auto');
        if (!el) return;
        el.innerText = 'Replay Automático: ' + (this.automatico ? 'ON' : 'OFF');
        el.classList.toggle('active', this.automatico);
    }

    /*
    O INSTANTE DO GOLO, marcado por quem o valida (ver mudarEstado para 'GOAL',
    js/match/match_physics.js). E o `head` e nao o `head - 1` de proposito: o
    `head` e o proximo frame a gravar, portanto o ultimo JA gravado e o de
    tras — a diferenca e um frame e a marca so serve de ancora.

    Fica guardado porque a repeticao so arranca uns segundos depois (a festa do
    golo continua a gravar por cima), e "os ultimos 15 s antes do golo" conta-se
    do golo e nao de quando se carrega no play.
    */
    marcarGolo() {
        this.marcaDoGolo = this.head;
    }

    /*
    ARRANCA A REPETICAO DO GOLO. Devolve false se nao houver nada gravado ou se
    o automatico estiver desligado — e ai o golo segue o seu caminho normal.
    */
    replayDoGolo() {
        if (!this.automatico || this.count === 0 || this.marcaDoGolo === null) return false;

        const fps = 60;
        const antes = Math.round(REPLAY_GOLO.SEGUNDOS_ANTES * fps);
        const depois = Math.round(REPLAY_GOLO.SEGUNDOS_DEPOIS * fps);

        /*
        Quantos frames ha mesmo para tras: nos primeiros segundos de jogo o
        buffer ainda nao deu a volta, e pedir 15 s dava o lixo do outro lado.
        */
        const disponiveis = Math.min(this.count - 1, REPLAY_FRAMES - 1);
        const recuo = Math.min(antes, disponiveis);
        if (recuo < fps) return false;   // menos de um segundo nao e repeticao

        this.camaraAnterior = (typeof window !== 'undefined') ? window.cameraMode : null;
        this.eraAutomatico = true;
        this.replayFim = (this.marcaDoGolo + depois) % REPLAY_FRAMES;
        this.startReplay((this.marcaDoGolo - recuo + REPLAY_FRAMES) % REPLAY_FRAMES);

        if (typeof Match !== 'undefined' && Match.setCameraMode) {
            Match.setCameraMode(REPLAY_GOLO.CAMARA);
        }
        return true;
    }

    /*
    Os corpos do frame, SEMPRE na mesma ordem: 22 jogadores e depois a
    arbitragem. A ordem é o formato do buffer — mudar aqui é mudar o formato.
    Entradas em falta vêm a null e o gravador salta o espaço delas, para o
    índice nunca depender de quem existe.
    */
    corposDoFrame() {
        const lista = Match.players.concat(Match.opponents).slice(0, 22);
        while (lista.length < 22) lista.push(null);
        const O = (typeof Officials !== 'undefined') ? Officials : null;
        lista.push(O ? O.arbitro : null);
        lista.push(O && O.assistentes ? O.assistentes[0] : null);
        lista.push(O && O.assistentes ? O.assistentes[1] : null);
        return lista;
    }

    recordFrame() {
        if (this.isReplaying || !Match.ball) return;
        
        const base = this.head * FLOATS_PER_FRAME;
        let pIdx = base;
        
        this.buffer[pIdx++] = Match.ball.position.x;
        this.buffer[pIdx++] = Match.ball.position.y;
        this.buffer[pIdx++] = Match.ball.position.z;
        /*
        O QUATERNIAO E O DO `ballVisual`, E NAO O DO `ball`.

        Era o do `ball`, e por isso a bola nao rolava na repeticao: quem a faz
        rolar e o `MatchPhysics`, que escreve em `this.ballVisual.quaternion`
        (a malha, filha do `ball`) a partir da velocidade. O `ball` e so o no
        de POSICAO — ninguem lhe toca na rotacao em parte nenhuma do jogo.
        Gravavam-se quatro numeros sempre iguais a (0, 0, 0, 1) e repunha-se a
        identidade, enquanto a malha ficava congelada na rotacao em que o
        ultimo frame ao vivo a deixou. Relato: *"no replay a bola nao esta
        rolando"*.
        */
        const qb = Match.ballVisual ? Match.ballVisual.quaternion : Match.ball.quaternion;
        this.buffer[pIdx++] = qb.x;
        this.buffer[pIdx++] = qb.y;
        this.buffer[pIdx++] = qb.z;
        this.buffer[pIdx++] = qb.w;

        const corpos = this.corposDoFrame();
        for(let i = 0; i < CORPOS_POR_FRAME; i++) {
            let p = corpos[i];
            if (!p || !p.model || !p.rig) {
                pIdx += FLOATS_PER_PLAYER;
                continue;
            }
            this.buffer[pIdx++] = p.model.position.x;
            this.buffer[pIdx++] = p.model.position.y;
            this.buffer[pIdx++] = p.model.position.z;
            this.buffer[pIdx++] = p.model.quaternion.x;
            this.buffer[pIdx++] = p.model.quaternion.y;
            this.buffer[pIdx++] = p.model.quaternion.z;
            this.buffer[pIdx++] = p.model.quaternion.w;

            let r = p.rig;
            this.buffer[pIdx++] = r.pelvis.position.x;
            this.buffer[pIdx++] = r.pelvis.position.y;
            this.buffer[pIdx++] = r.pelvis.position.z;

            this.buffer[pIdx++] = r.pelvis.rotation.x; this.buffer[pIdx++] = r.pelvis.rotation.y; this.buffer[pIdx++] = r.pelvis.rotation.z;
            this.buffer[pIdx++] = r.chest.rotation.x; this.buffer[pIdx++] = r.chest.rotation.y; this.buffer[pIdx++] = r.chest.rotation.z;
            this.buffer[pIdx++] = r.lArm.rotation.x; this.buffer[pIdx++] = r.lArm.rotation.y; this.buffer[pIdx++] = r.lArm.rotation.z;
            this.buffer[pIdx++] = r.rArm.rotation.x; this.buffer[pIdx++] = r.rArm.rotation.y; this.buffer[pIdx++] = r.rArm.rotation.z;
            this.buffer[pIdx++] = r.lElbow.rotation.x; this.buffer[pIdx++] = r.lElbow.rotation.y; this.buffer[pIdx++] = r.lElbow.rotation.z;
            this.buffer[pIdx++] = r.rElbow.rotation.x; this.buffer[pIdx++] = r.rElbow.rotation.y; this.buffer[pIdx++] = r.rElbow.rotation.z;
            this.buffer[pIdx++] = r.lLeg.rotation.x; this.buffer[pIdx++] = r.lLeg.rotation.y; this.buffer[pIdx++] = r.lLeg.rotation.z;
            this.buffer[pIdx++] = r.rLeg.rotation.x; this.buffer[pIdx++] = r.rLeg.rotation.y; this.buffer[pIdx++] = r.rLeg.rotation.z;
            this.buffer[pIdx++] = r.lKnee.rotation.x; this.buffer[pIdx++] = r.lKnee.rotation.y; this.buffer[pIdx++] = r.lKnee.rotation.z;
            this.buffer[pIdx++] = r.rKnee.rotation.x; this.buffer[pIdx++] = r.rKnee.rotation.y; this.buffer[pIdx++] = r.rKnee.rotation.z;
            this.buffer[pIdx++] = r.lFoot.rotation.x; this.buffer[pIdx++] = r.lFoot.rotation.y; this.buffer[pIdx++] = r.lFoot.rotation.z;
            this.buffer[pIdx++] = r.rFoot.rotation.x; this.buffer[pIdx++] = r.rFoot.rotation.y; this.buffer[pIdx++] = r.rFoot.rotation.z;
            
            if (r.neck) {
                this.buffer[pIdx++] = r.neck.rotation.x; this.buffer[pIdx++] = r.neck.rotation.y; this.buffer[pIdx++] = r.neck.rotation.z;
            } else {
                this.buffer[pIdx++] = 0; this.buffer[pIdx++] = 0; this.buffer[pIdx++] = 0;
            }
        }

        /*
        A REDE, no fim do frame: `t` e `amplitude` da onda por baliza.

        O `NetWave.update` e o `NetWave.bater` vivem os dois dentro do
        `Match.update`, que NAO corre durante a repeticao — e disso que a
        repeticao vive. Sem isto a rede ficava imovel na deformacao em que o
        jogo a deixou, enquanto a bola entrava outra vez a frente dela.
        */
        const rede = (typeof NetWave !== 'undefined') ? NetWave.estado() : [0, 0, 0, 0];
        this.buffer[pIdx++] = rede[0]; this.buffer[pIdx++] = rede[1];
        this.buffer[pIdx++] = rede[2]; this.buffer[pIdx++] = rede[3];

        this.head = (this.head + 1) % REPLAY_FRAMES;
        if (this.count < REPLAY_FRAMES) this.count++;
    }
    
    /*
    `inicio` (opcional) e o frame gravado por onde comecar — e o que a
    repeticao do golo usa para nao comecar no principio do buffer. Sem ele fica
    tudo como estava: os 20 s desde o frame mais antigo.
    */
    startReplay(inicio) {
        if (this.count === 0) return;
        this.isReplaying = true;
        this.replayCursor = (typeof inicio === 'number')
            ? inicio
            : ((this.count < REPLAY_FRAMES) ? 0 : this.head);
        this._avancoPendente = 0;
        
        let el = document.getElementById('btn-replay');
        if (el) {
            el.innerText = 'Stop Replay';
            el.style.backgroundColor = '#e74c3c';
        }

        /*
        A PAUSA FICA DE FORA. Era aqui que o replay parava o jogo, e isso
        contradizia o `playFrame`, que não avança em pausa — a repetição ficava
        congelada. Quem segura a simulação agora é o próprio `isReplaying`, no
        `animate` (js/main.js), e o botão de pause volta a querer dizer só uma
        coisa: o utilizador mandou parar.
        */
        this.actualizarAvisoDeReplay();
        if (typeof TouchControls !== 'undefined') TouchControls.updateButtonsState();
    }
    
    stopReplay() {
        if (this.isReplaying) {
            this.isReplaying = false; // Set to false FIRST to prevent infinite loop!
            // Restore to the newest frame (head - 1) before stopping
            this.replayCursor = (this.head - 1 + REPLAY_FRAMES) % REPLAY_FRAMES;
            // Manually inline playFrame logic for one frame to restore state safely
            this.restoreFrame(this.replayCursor);
        }
        this.replayFim = null;

        /*
        A REPETICAO AUTOMATICA DEVOLVE A CAMARA que pediu emprestada.

        A manual nao tem nada para devolver: ela corre de onde o utilizador
        estiver a ver, e e por isso que so a automatica guarda o `camaraAnterior`.
        */
        if (this.eraAutomatico) {
            this.eraAutomatico = false;
            this.marcaDoGolo = null;
            if (this.camaraAnterior && typeof Match !== 'undefined' && Match.setCameraMode) {
                Match.setCameraMode(this.camaraAnterior);
            }
            this.camaraAnterior = null;
        }

        let el = document.getElementById('btn-replay');
        if (el) {
            el.innerText = 'Replay (20s)';
            el.style.backgroundColor = '';
        }
        this.actualizarAvisoDeReplay();
        if (typeof TouchControls !== 'undefined') TouchControls.updateButtonsState();
    }

    restoreFrame(idx) {
        if (this.count === 0) return;
        const base = idx * FLOATS_PER_FRAME;
        let pIdx = base;
        
        Match.ball.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
        // A rotacao vive na MALHA e nao no no de posicao — ver `recordFrame`.
        const qb = Match.ballVisual ? Match.ballVisual.quaternion : Match.ball.quaternion;
        qb.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);

        const corpos = this.corposDoFrame();
        for(let i = 0; i < CORPOS_POR_FRAME; i++) {
            let p = corpos[i];
            if (!p || !p.model || !p.rig) {
                pIdx += FLOATS_PER_PLAYER;
                continue;
            }
            p.model.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            p.model.quaternion.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);

            let r = p.rig;
            r.pelvis.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.pelvis.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.chest.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.lArm.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.rArm.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.lElbow.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.rElbow.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.lLeg.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.rLeg.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.lKnee.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.rKnee.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.lFoot.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            r.rFoot.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            
            if (r.neck) {
                r.neck.rotation.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
            } else {
                pIdx += 3;
            }
        }

        // A onda da rede, no estado exacto em que estava neste frame.
        if (typeof NetWave !== 'undefined') {
            NetWave.repor(this.buffer[pIdx], this.buffer[pIdx + 1],
                this.buffer[pIdx + 2], this.buffer[pIdx + 3]);
        }
        pIdx += FLOATS_PER_REDE;
    }

    toggleReplay() {
        if (this.isReplaying) this.stopReplay();
        else this.startReplay();
    }
    
    /*
    =====================================================================
    A VELOCIDADE DO REPLAY — o mesmo controlo do jogo, 0.6x incluido
    =====================================================================
    O replay corria sempre a 1x: um frame gravado por frame desenhado, e o
    `window.speedMultiplier` (o 0.6x / 1.0x / 1.2x / 2x / Frame do painel) era
    ignorado aqui. Pedido: poder ver o replay a 0.6x.

    O `startReplay` poe o jogo em pausa, portanto o bloco de velocidade do
    `animate` (main.js) nem chega a correr — a velocidade tem de ser lida
    outra vez, deste lado.

    Devolve quantos frames GRAVADOS avancar por frame desenhado:
        0.6  -> camara lenta (o mesmo frame fica no ecra 1 ou 2 vezes)
        2    -> dois frames gravados de cada vez
        'frame' -> so avanca quando o botao pede o passo seguinte
    */
    velocidadeDoReplay() {
        const v = window.speedMultiplier;
        if (v === 'frame') {
            if (typeof Match !== 'undefined' && Match.stepNextFrame) {
                Match.stepNextFrame = false;
                return 1;
            }
            return 0;
        }
        const n = Number(v);
        return (isFinite(n) && n > 0) ? n : 1;
    }

    /*
    Desenha o frame actual e avanca o cursor conforme a velocidade escolhida.

    O corpo que aqui estava era uma copia LINHA A LINHA do `restoreFrame` —
    as duas versoes tinham de ser mantidas a par a cada osso novo no rig.
    Agora e uma chamada.
    */
    playFrame() {
        if (!this.isReplaying || this.count === 0) return;

        /*
        O PAUSE TAMBÉM VALE NO REPLAY — pedido: *"tem que ter o pause no replay
        também"*.

        O botão só travava o jogo: durante a repetição o `animate` chamava este
        método sem olhar ao `isPaused`, e a repetição corria na mesma. Agora
        pára no frame onde está — e repor esse frame continua a acontecer, senão
        os corpos ficavam com a pose do jogo por baixo da repetição parada.
        */
        this.restoreFrame(this.replayCursor);
        if (typeof window !== 'undefined' && window.isPaused) return;

        /*
        A fraccao acumula-se entre frames: a 0.6x, tres frames desenhados
        fazem avancar 1.8, ou seja um frame gravado e o resto fica para o
        proximo. E o que faz a camara lenta ser lenta em vez de saltada.
        */
        this._avancoPendente = (this._avancoPendente || 0) + this.velocidadeDoReplay();
        /*
        O epsilon nao e cosmetico: somar 0.6 dez vezes em virgula flutuante da
        5.999999999999999, e o `floor` comia o decimo passo — a camara lenta
        ficava a andar menos do que o pedido, e a deriva acumulava ao longo dos
        20 s de replay.
        */
        let passos = Math.floor(this._avancoPendente + 1e-6);
        this._avancoPendente -= passos;

        while (passos-- > 0) {
            this.replayCursor = (this.replayCursor + 1) % REPLAY_FRAMES;
            /*
            Duas linhas de meta: o fim do que esta gravado (o `head`, sempre) e
            o fim PEDIDO, que a repeticao do golo poe a seguir a bola entrar —
            senao ela seguia pela festa do golo adentro ate ao fim do buffer.
            */
            if (this.replayCursor === this.head ||
                (this.replayFim !== null && this.replayCursor === this.replayFim)) {
                this.stopReplay();
                return;
            }
        }
    }
}

window.MatchReplay = new ReplaySystem();
