const REPLAY_FRAMES = 1200; // 20s at 60fps
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
const FLOATS_PER_FRAME = 7 + CORPOS_POR_FRAME * FLOATS_PER_PLAYER;

class ReplaySystem {
    constructor() {
        this.buffer = new Float32Array(REPLAY_FRAMES * FLOATS_PER_FRAME);
        this.head = 0; 
        this.count = 0; 
        this.isReplaying = false;
        this.replayCursor = 0; 
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
        this.buffer[pIdx++] = Match.ball.quaternion.x;
        this.buffer[pIdx++] = Match.ball.quaternion.y;
        this.buffer[pIdx++] = Match.ball.quaternion.z;
        this.buffer[pIdx++] = Match.ball.quaternion.w;

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
        
        this.head = (this.head + 1) % REPLAY_FRAMES;
        if (this.count < REPLAY_FRAMES) this.count++;
    }
    
    startReplay() {
        if (this.count === 0) return;
        this.isReplaying = true;
        this.replayCursor = (this.count < REPLAY_FRAMES) ? 0 : this.head;
        
        let el = document.getElementById('btn-replay');
        if (el) {
            el.innerText = 'Stop Replay';
            el.style.backgroundColor = '#e74c3c';
        }

        if (!window.isPaused) Match.togglePause();
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
        let el = document.getElementById('btn-replay');
        if (el) {
            el.innerText = 'Replay (20s)';
            el.style.backgroundColor = '';
        }
        if (typeof TouchControls !== 'undefined') TouchControls.updateButtonsState();
    }

    restoreFrame(idx) {
        if (this.count === 0) return;
        const base = idx * FLOATS_PER_FRAME;
        let pIdx = base;
        
        Match.ball.position.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);
        Match.ball.quaternion.set(this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++], this.buffer[pIdx++]);

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
            if (this.replayCursor === this.head) {
                this.stopReplay();
                return;
            }
        }
    }
}

window.MatchReplay = new ReplaySystem();
