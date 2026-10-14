/*
=============================================================================
OS OFICIAIS NUNCA FICAM DE COSTAS PARA A BOLA — guarda final, num ficheiro só dele
=============================================================================
Relato, repetido muitas vezes: *"o juiz e os bandeirinhas estão caminhando de costas para a bola"*. Foi corrigido
dentro do `Officials.mover` (RefereeModel.anguloMaxDaBola) e voltou sempre: o `mover` só corrige quando o oficial
está a andar, e há outros caminhos que escrevem a frente dele (a viragem para o jogador, a coreografia, o
reposicionamento depois de uma falta, os assistentes na linha...). Cada alteração a um deles desfazia a regra.

Por isso a regra vive AQUI, depois de tudo: este ficheiro carrega depois do officials.js e embrulha o
`Officials.update`. Quando o update original acaba — seja por onde for que tenha escrito o `rotation.y` —, se a
bola ficou a mais de `anguloMax` da frente de um oficial, a frente é trazida de volta para esse limite. Não depende
de nenhum estado interno do officials.js, e `tests/oficiais_olham_a_bola.test.js` mede-o com o jogo a correr.

Excepções (a frente é deles de propósito): a coreografia de abertura, e o árbitro enquanto faz um sinal para um
jogador (cartão, marcação) — `arbitro.sinal`.
=============================================================================
*/
const OficiaisOlhamABola = {
    activo: true,
    // O máximo que a frente do oficial pode afastar-se da direcção da bola (graus). 90 = a bola nunca fica atrás.
    anguloMaxGraus: { arbitro: 80, assistente: 90 },
    // Só se corrige com a bola a mais de isto (m): colado a ela a direcção não é fiável.
    distMin: 1.5,

    _wrapped: false,

    // Corrige um oficial. Devolve o desvio (rad) que havia antes de corrigir, para a medição.
    _corrigir(o, maxRad, dt) {
        if (!o || !o.model || !Match || !Match.ball) return 0;
        const ox = Match.ball.position.x - o.model.position.x;
        const oz = Match.ball.position.z - o.model.position.z;
        if (Math.hypot(ox, oz) < this.distMin) return 0;
        const paraBola = Math.atan2(ox, oz);
        const desvio = Math.atan2(Math.sin(o.model.rotation.y - paraBola), Math.cos(o.model.rotation.y - paraBola));
        if (Math.abs(desvio) <= maxRad) return Math.abs(desvio);
        const alvo = paraBola + Math.sign(desvio) * maxRad;
        // Direto ao limite, sem suavizar: o officials.js reescreve a frente INTEIRA todos os frames, e uma correcção
        // parcial por frame nunca a trazia de volta (medido: continuava de costas).
        o.model.rotation.y = alvo;
        return Math.abs(desvio);
    },

    aplicar(dt) {
        if (!this.activo || typeof Officials === 'undefined') return;
        if (typeof Abertura !== 'undefined' && Abertura.activa) return;
        const G = this.anguloMaxGraus, k = Math.PI / 180;
        const arb = Officials.arbitro;
        if (arb && !arb.sinal) this._corrigir(arb, G.arbitro * k, dt);
        for (const a of (Officials.assistentes || [])) this._corrigir(a, G.assistente * k, dt);
    },

    // Embrulha o Officials.update uma vez só.
    instalar() {
        if (this._wrapped || typeof Officials === 'undefined' || typeof Officials.update !== 'function') return;
        this._wrapped = true;
        const original = Officials.update;
        Officials.update = function (dt) {
            const r = original.call(this, dt);
            OficiaisOlhamABola.aplicar(dt);
            return r;
        };
    }
};
OficiaisOlhamABola.instalar();
if (typeof window !== 'undefined') window.OficiaisOlhamABola = OficiaisOlhamABola;
