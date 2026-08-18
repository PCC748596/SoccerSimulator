/*
=============================================================================
MarkingDebug — o círculo de marcação, desenhado
=============================================================================
Desenha UM anel no chão à volta de cada jogador que está a ser marcado, com o
raio que o Defensive Pressure manda para aquele setor
(MarkingModel.distanciaPara). É o mesmo número que o jogo usa; isto só o
mostra.

O anel é a zona onde o marcador NÃO entra. Se o marcador estiver em cima da
linha do anel, está à distância certa.

Cor do anel:
    verde     o marcador está à distância pedida
    amarelo   está mais LONGE do que devia
    vermelho  está mais PERTO do que devia

O anel aparece à volta do jogador MARCADO, que é sempre um adversário de quem
o marca — nunca um companheiro. Um jogador sem anel é um jogador que ninguém
está a marcar.

Não decide nada: só lê `p.markingTarget`, escrito pelo assignMarking.
=============================================================================
*/
const MarkingDebug = {
    debug: false,
    tolerancia: 0.75,      // metros de folga antes de pintar de amarelo/vermelho
    _grupo: null,
    _aneis: [],
    _usadosAneis: 0,

    _cores: {
        certo: 0x2ecc71,
        longe: 0xf1c40f,
        perto: 0xe74c3c
    },

    garantirGrupo: function () {
        if (this._grupo) return;
        this._grupo = new THREE.Group();
        Match.scene.add(this._grupo);
    },

    setDebug: function (on) {
        this.debug = on;
        this.garantirGrupo();
        this._grupo.visible = on;
        if (!on) {
            this._usadosAneis = 0;
            this.esconderResto();
        }
    },

    /*
    Anel do raio pedido. A geometria de um anel tem o raio cozido dentro, e
    o raio muda com o setor e com o Defensive Pressure — por isso o anel é
    criado com raio 1 e escalado, em vez de recriado a cada frame.
    */
    obterAnel: function () {
        if (this._usadosAneis < this._aneis.length) {
            const a = this._aneis[this._usadosAneis++];
            a.visible = true;
            return a;
        }
        const geo = new THREE.RingGeometry(0.97, 1.0, 40);
        const anel = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.55
        }));
        anel.rotation.x = -Math.PI / 2;
        this._grupo.add(anel);
        this._aneis.push(anel);
        this._usadosAneis++;
        return anel;
    },

    esconderResto: function () {
        for (let i = this._usadosAneis; i < this._aneis.length; i++) this._aneis[i].visible = false;
    },

    update: function () {
        if (!this.debug) return;
        this.garantirGrupo();
        this._usadosAneis = 0;

        const todos = Match.players.concat(Match.opponents);
        for (const p of todos) {
            const alvo = p.markingTarget;
            if (!alvo) continue;

            const pedida = MarkingModel.distanciaPara(alvo.model.position.z * p.dirZ);
            const real = p.model.position.distanceTo(alvo.model.position);

            let cor = this._cores.certo;
            if (real > pedida + this.tolerancia) cor = this._cores.longe;
            else if (real < pedida - this.tolerancia) cor = this._cores.perto;

            const anel = this.obterAnel();
            anel.position.set(alvo.model.position.x, 0.04, alvo.model.position.z);
            anel.scale.set(pedida, pedida, 1);
            anel.material.color.setHex(cor);
        }

        this.esconderResto();
    },

    /*
    Resumo em texto para o painel: quantos marcadores há e quantos estão à
    distância certa. É isto que responde de facto a "a marcação está
    correcta?" — a cor mostra caso a caso, isto mostra o conjunto.
    */
    resumo: function () {
        const todos = Match.players.concat(Match.opponents);
        let n = 0, certos = 0, longe = 0, perto = 0, somaErro = 0;

        for (const p of todos) {
            const alvo = p.markingTarget;
            if (!alvo) continue;
            const pedida = MarkingModel.distanciaPara(alvo.model.position.z * p.dirZ);
            const real = p.model.position.distanceTo(alvo.model.position);
            n++;
            somaErro += Math.abs(real - pedida);
            if (real > pedida + this.tolerancia) longe++;
            else if (real < pedida - this.tolerancia) perto++;
            else certos++;
        }

        return {
            marcadores: n,
            certos: certos,
            longe: longe,
            perto: perto,
            erroMedio: n ? somaErro / n : 0
        };
    }
};
