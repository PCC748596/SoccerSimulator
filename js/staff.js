/*
=============================================================================
STAFF — os funcionários do estádio, de colete laranja
=============================================================================
O anel de pessoal de serviço à volta do recinto: uma fila a 1 m da primeira
fila da bancada, e pequenos grupos atrás das placas de publicidade. As medidas
e as cores vivem no `FuncionariosEstadio` (config/physics.js); aqui está só a
construção.

O MODELO É O DOS ADEPTOS, e é reaproveitado inteiro: `Crowd._geometriasDaPose`
já funde o boneco dos jogadores numa geometria por canal de cor (pele, camisa,
calção, cabelo) para uma pose dada. Um funcionário é um adepto com o canal da
camisa pintado de laranja e posto no relvado em vez de num degrau.

    Por isso não há rig, nem animação, nem update por frame. São
    InstancedMesh estáticos — duas poses × quatro canais, oito draw calls para
    o pessoal todo — e o `build` corre uma vez, dentro do `createField`.

AS POSES SÃO AS DO PÚBLICO, pela mesma razão: `dePe` para quem está de serviço
à frente da bancada, `sentado` para quem espera atrás das placas, com um banco
baixo por baixo (a pose sentada tem as pernas dobradas de quem está num
assento, e sem o banco ficava de cócoras no ar).

O QUE ESTE FICHEIRO NÃO FAZ, e é deliberado: não lê o `Match`, não reage ao
jogo e não se mexe. O público já tem tudo isso (ver crowd.js, com o movimento
todo no vertex shader); aqui são oitenta e tantos bonecos de cenário, e
qualquer coisa por frame para eles é trabalho a pagar sem nada para ver.
=============================================================================
*/

const Staff = {
    _grupo: null,

    /*
    Gerador determinista. O estádio tem de sair igual em duas execuções
    seguidas — senão uma captura de ecrã nunca reproduz a anterior, e a
    variação de pele/altura passava a piscar entre recargas.
    */
    _semear(s) {
        let semente = s | 0;
        return () => {
            semente = (semente * 1103515245 + 12345) & 0x7fffffff;
            return semente / 0x7fffffff;
        };
    },

    /*
    OS PONTOS DO ANEL, com as esquinas arredondadas da bancada.

    Percorre-se o perímetro por comprimento de arco e põe-se um funcionário a
    cada `passo` metros. Fazer as rectas por `for (z += passo)` e as curvas por
    ângulo dava dois espaçamentos diferentes — apertado nas curvas, porque um
    passo em ângulo não é um passo em metros.

    `X`/`Z` são os limites das rectas, `R` o raio das curvas e (`cx`, `cz`) os
    centros delas — os mesmos centros da bancada e das placas, portanto os três
    anéis ficam concêntricos.
    */
    _pontosDoAnel(X, Z, R, cx, cz, passo) {
        /*
        Os oito segmentos, pela ordem em que fecham o anel: recta, curva,
        recta, curva... Cada um sabe dar um ponto a partir do comprimento `s`
        já andado dentro dele.
        */
        const segmentos = [];
        const recta = (x0, z0, x1, z1) => {
            const L = Math.hypot(x1 - x0, z1 - z0);
            segmentos.push({
                L,
                em: (s) => {
                    const t = s / L;
                    return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t };
                }
            });
        };
        const curva = (ccx, ccz, a0) => {
            const L = R * Math.PI / 2;
            segmentos.push({
                L,
                em: (s) => {
                    const a = a0 + (s / R);
                    return { x: ccx + R * Math.cos(a), z: ccz + R * Math.sin(a) };
                }
            });
        };

        // Começa no meio da lateral Este (+X) e roda no sentido dos z
        // crescentes; o ângulo de cada curva sai do quadrante dela.
        recta(X, 0, X, cz);
        curva(cx, cz, 0);                    // (+X, +Z)
        recta(cx, Z, -cx, Z);
        curva(-cx, cz, Math.PI / 2);         // (-X, +Z)
        recta(-X, cz, -X, -cz);
        curva(-cx, -cz, Math.PI);            // (-X, -Z)
        recta(-cx, -Z, cx, -Z);
        curva(cx, -cz, 3 * Math.PI / 2);     // (+X, -Z)
        recta(X, -cz, X, 0);

        const total = segmentos.reduce((a, s) => a + s.L, 0);
        /*
        O PASSO AJUSTA-SE PARA O ANEL FECHAR. Com o passo exacto o último
        intervalo é o resto da divisão — dois funcionários a 1 m um do outro no
        ponto onde a volta se fecha. Reparte-se a sobra por todos: com 5 m
        pedidos e 424 m de perímetro, o passo real fica a centímetros disso.
        */
        const n = Math.max(1, Math.round(total / passo));
        const passoReal = total / n;

        const saida = [];
        let iSeg = 0, base = 0;
        for (let i = 0; i < n; i++) {
            const s = i * passoReal;
            while (iSeg < segmentos.length - 1 && s > base + segmentos[iSeg].L) {
                base += segmentos[iSeg].L;
                iSeg++;
            }
            const p = segmentos[iSeg].em(Math.min(s - base, segmentos[iSeg].L));
            saida.push(p);
        }
        return saida;
    },

    /*
    OS GRUPOS ATRÁS DAS PLACAS. Cada lado leva `porLado` grupos, espalhados ao
    longo dele e nunca em cima da linha de meio-campo nem do eixo das balizas —
    os centros saem de uma divisão que deixa margem nas pontas, senão um grupo
    caía dentro da curva da esquina, onde a placa já virou e eles ficariam de
    lado para o campo.
    */
    _pontosDosGrupos(placaX, placaZ, cantoX, cantoZ, G, rnd) {
        const saida = [];

        const linha = (eixo, sinal, fixo, limite, quantos) => {
            if (quantos <= 0) return;
            for (let g = 1; g <= quantos; g++) {
                // Centros em `limite * (2g - quantos - 1) / (quantos + 1)`:
                // simétricos em relação ao meio e com folga nas pontas.
                const centro = limite * (2 * g - quantos - 1) / (quantos + 1);
                for (let i = 0; i < G.pessoasPorGrupo; i++) {
                    const d = centro + (i - (G.pessoasPorGrupo - 1) / 2) * G.passoNoGrupo;
                    if (Math.abs(d) > limite) continue;
                    // Um passo de recuo por pessoa: um grupo é um bolo, não uma
                    // fila de três.
                    const recuo = (fixo > 0 ? 1 : -1) * (rnd() * 0.5);
                    if (eixo === 'x') saida.push({ x: fixo + recuo, z: d });
                    else saida.push({ x: d, z: fixo + recuo });
                }
            }
        };

        const rx = placaX + G.recuoDaPlaca;
        const rz = placaZ + G.recuoDaPlaca;
        linha('x', 1, rx, cantoZ, G.porLadoLateral);
        linha('x', -1, -rx, cantoZ, G.porLadoLateral);
        linha('z', 1, rz, cantoX, G.porLadoFundo);
        linha('z', -1, -rz, cantoX, G.porLadoFundo);
        return saida;
    },

    /*
    O CORPO VESTIDO DE TRABALHO: calças compridas e sapatos.

    Pedido: *"eles têm que estar de calças compridas"*. O corpo do público tem
    a coxa e a canela no canal da PELE (é um adepto de calções), portanto
    pintar-lhe as calças não era uma cor: era mudar em que canal as pernas
    caem. O `Crowd._pecas(pose, mapa)` aceita essa troca — as caixas são as
    mesmas, na mesma ordem, muda só o canal —, e é por isso que não há aqui uma
    segunda cópia do corpo a divergir da do crowd.js.

        pernas  ->  `calcao`, o canal do tecido. A perna inteira fica da cor
                    das calças, e o bloco do calção que lá estava passa a ser
                    a cintura delas.
        pés     ->  `sapato`, um canal novo e escuro: com os pés no canal das
                    calças, um fotógrafo de calças cáqui ficava de sapatos
                    cáqui.

    São cinco canais em vez de quatro — cinco draw calls por pose. A escala é a
    do corpo dos jogadores e vem de lá (`ESCALA_CORPO`, pose.js), como no
    crowd.js: escrita à mão, os funcionários ficariam de outro tamanho que todo
    o mundo assim que ela mudasse.
    */
    _geometriasVestidas(pose) {
        const pecas = Crowd._pecas(pose, { perna: 'calcao', pe: 'sapato' });
        const escala = (typeof ESCALA_CORPO === 'number') ? ESCALA_CORPO : 1.8 / 5.5;
        const saida = {};
        for (const canal in pecas) {
            if (!pecas[canal].length) continue;
            const g = mergeNonIndexedGeometries(pecas[canal]);
            g.scale(escala, escala, escala);
            saida[canal] = g;
        }
        return saida;
    },

    /*
    Geometrias por canal para uma pose, com os PÉS NO ZERO.

    A pose do público está medida para um degrau (ver `alturaBacia` no
    CrowdModel) e por isso não assenta no y = 0 sozinha: a de pé fica uns
    centímetros acima, a sentada bem mais. Mede-se a caixa envolvente do canal
    mais baixo e desce-se o conjunto todo pelo mesmo valor — pelo MESMO, e não
    canal a canal, senão a cabeça descia até ao chão junto com os pés.
    */
    _geometrias(pose) {
        const geos = this._geometriasVestidas(pose);
        let minY = Infinity;
        for (const canal in geos) {
            geos[canal].computeBoundingBox();
            minY = Math.min(minY, geos[canal].boundingBox.min.y);
        }
        if (isFinite(minY)) {
            for (const canal in geos) {
                geos[canal].translate(0, -minY, 0);
                geos[canal].computeBoundingSphere();
            }
        }
        return geos;
    },

    /*
    A cor de um canal, com a variação por pessoa — e `tipo` é quem ele é:

        'anel'      funcionário do estádio: colete LARANJA e calças todas
                    iguais. É um fardamento, e o que se lê nele é ser igual em
                    toda a gente.
        'imprensa'  fotógrafo ou reporter atrás das placas: colete AMARELO por
                    cima da roupa dele. Por isso as calças saem do baralho
                    `roupasImprensa` — eles não são do estádio, são gente à
                    civil com um colete emprestado.

    O COLETE NÃO LEVA A VARIAÇÃO DE TOM que a roupa leva, nos dois casos: a
    razão de um alta-visibilidade existir é ser exactamente a mesma cor em
    todos, e variá-lo ±10% desfazia isso.
    */
    _corDe(canal, F, rnd, tipo) {
        const c = new THREE.Color();
        const imprensa = (tipo === 'imprensa');
        if (canal === 'camisa') {
            return c.set(imprensa ? F.cores.coleteImprensa : F.cores.colete);
        }
        if (canal === 'sapato') {
            c.set(F.cores.sapatos);
            const ks = 1 + (rnd() - 0.5) * 2 * F.variacaoCor;
            return c.multiplyScalar(ks);
        }
        if (canal === 'calcao') {
            const baralho = F.cores.roupasImprensa;
            c.set((imprensa && baralho && baralho.length)
                ? baralho[Math.floor(rnd() * baralho.length)]
                : F.cores.calcas);
        } else if (canal === 'pele') {
            c.set(CrowdModel.peles[Math.floor(rnd() * CrowdModel.peles.length)]);
        } else {
            c.set(CrowdModel.cabelos[Math.floor(rnd() * CrowdModel.cabelos.length)]);
        }
        const k = 1 + (rnd() - 0.5) * 2 * F.variacaoCor;
        return c.multiplyScalar(k);
    },

    /*
    UM MATERIAL POR CANAL, e as duas cores de colete cabem no mesmo: a cor
    difusa vem da instância (`setColorAt`), portanto laranja e amarelo
    convivem na mesma malha. O que é do MATERIAL e não da instância é a cor
    EMISSIVA — e é por isso que ela é um âmbar escuro em vez do tom de um dos
    dois coletes (ver `emissiveColete` no config).
    */
    _material(canal, F) {
        if (canal === 'camisa') {
            return new THREE.MeshStandardMaterial({
                color: 0xffffff, roughness: 0.55,
                emissive: new THREE.Color(F.cores.emissiveColete),
                emissiveIntensity: 0.45
            });
        }
        return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    },

    /*
    Constrói o pessoal todo dentro de `grupo`.

    `geo` são as medidas que o `createField` já tem em mão:
        bancadaX / bancadaZ        primeira fila da bancada
        cantoX / cantoZ            centros das curvas das esquinas
        raioPrimeiraFila           raio dessas curvas
        placaX / placaZ            os painéis de publicidade

    Devolve o número de funcionários postos, ou 0 se estiver desligado (é o que
    os testes leem).
    */
    build(grupo, geo) {
        const F = (typeof FuncionariosEstadio !== 'undefined') ? FuncionariosEstadio : null;
        if (!F || !F.activo || !grupo || !geo) return 0;
        if (typeof Crowd === 'undefined' || typeof CrowdModel === 'undefined') return 0;

        const rnd = this._semear(20260917);

        /*
        DE PÉ no anel da bancada, e atrás das placas metade sentada. `lugares`
        junta os dois conjuntos porque daqui para baixo só interessa a pose.
        */
        const lugares = { dePe: [], sentado: [] };

        const anel = this._pontosDoAnel(
            geo.bancadaX - F.recuoDaBancada,
            geo.bancadaZ - F.recuoDaBancada,
            Math.max(0.5, geo.raioPrimeiraFila - F.recuoDaBancada),
            geo.cantoX, geo.cantoZ, F.espacamento);
        for (const p of anel) lugares.dePe.push({ x: p.x, z: p.z, tipo: 'anel' });

        if (F.grupos && F.grupos.activo) {
            const pts = this._pontosDosGrupos(
                geo.placaX, geo.placaZ, geo.cantoX, geo.cantoZ, F.grupos, rnd);
            for (const p of pts) {
                const sentado = rnd() < F.grupos.fraccaoSentados;
                /*
                O `tipo` viaja com o ponto porque as duas poses misturam os
                dois grupos de gente: um fotógrafo de pé vai para a MESMA
                InstancedMesh que um funcionário do anel, e é a cor por
                instância que os separa. Sem a etiqueta, ao juntar as listas
                perdia-se quem era quem.
                */
                lugares[sentado ? 'sentado' : 'dePe'].push(
                    { x: p.x, z: p.z, tipo: 'imprensa' });
            }
        }

        const dummy = new THREE.Object3D();
        const bancos = [];

        for (const nomePose of ['dePe', 'sentado']) {
            const pontos = lugares[nomePose];
            if (!pontos.length) continue;

            const geos = this._geometrias(CrowdModel.poses[nomePose]);
            const canais = Object.keys(geos);
            /*
            A ALTURA DO ASSENTO SAI DA POSE, medida no calção: na pose
            `sentado` os pés estão no zero e a anca a 0.61 m, e é aí que o
            banco tem de acabar. Escrita à mão no config, a caixa saía-lhe
            pela cintura ou deixava-o a flutuar — e mudar `ESCALA_CORPO`
            desalinhava-a sem ninguém dar por isso.
            */
            let alturaAssento = 0;
            if (geos.calcao) {
                geos.calcao.computeBoundingBox();
                alturaAssento = geos.calcao.boundingBox.max.y;
            }
            const malhas = {};
            for (const canal of canais) {
                const im = new THREE.InstancedMesh(
                    geos[canal], this._material(canal, F), pontos.length);
                im.castShadow = true;
                // Ver a nota do `mergedStepsMesh` (createField): a caixa da
                // sombra não chega à bancada, e receber sombra aqui era apanhar
                // o texel da borda do mapa.
                im.receiveShadow = false;
                /*
                SEM FRUSTUM CULLING, pela mesma razão do público (crowd.js): a
                caixa envolvente de uma InstancedMesh é a da GEOMETRIA, medida
                num boneco na origem, e as instâncias estão espalhadas por 400
                m de perímetro. Com culling, o anel inteiro desaparecia sempre
                que a origem saísse do enquadramento.
                */
                im.frustumCulled = false;
                im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
                malhas[canal] = im;
                grupo.add(im);
            }

            pontos.forEach((p, i) => {
                /*
                QUEM OLHA PARA ONDE — e são para lados opostos.

                Pedido: *"os funcionários vão ficar virados para o público e
                não para o campo"*. É o trabalho deles: um segurança vigia a
                bancada, de costas para o jogo — virado para o relvado estaria
                a ver o jogo, que é o contrário do que ali faz. A imprensa
                continua virada para o CAMPO, pela mesma razão ao contrário: é
                o jogo que eles filmam.

                O boneco olha para +Z com rotY = 0 (a convenção das cadeiras,
                ver `addSeatInstance`), portanto a direcção até à origem é
                `atan2(-x, -z)` e a que lhe dá as costas é `atan2(x, z)`.
                */
                const paraOPublico = (p.tipo === 'anel');
                const rotY = (paraOPublico ? Math.atan2(p.x, p.z)
                                           : Math.atan2(-p.x, -p.z)) +
                    (rnd() - 0.5) * 2 * F.variacaoRotacao;
                const escala = F.escalaMin + rnd() * (F.escalaMax - F.escalaMin);

                /*
                OS PÉS FICAM NO RELVADO nas duas poses — a sentada tem-nos no
                chão e a anca levantada, que é o que um banco por baixo
                completa. Levantar o boneco pela altura do banco era pô-lo a
                pairar com as pernas no ar.
                */
                if (nomePose === 'sentado') {
                    bancos.push({ x: p.x, z: p.z, rotY, altura: alturaAssento * escala });
                }

                dummy.position.set(p.x, 0, p.z);
                dummy.rotation.set(0, rotY, 0);
                dummy.scale.set(escala, escala, escala);
                dummy.updateMatrix();

                for (const canal of canais) {
                    malhas[canal].setMatrixAt(i, dummy.matrix);
                    malhas[canal].setColorAt(i, this._corDe(canal, F, rnd, p.tipo));
                }
            });

            for (const canal of canais) {
                malhas[canal].instanceMatrix.needsUpdate = true;
                if (malhas[canal].instanceColor) malhas[canal].instanceColor.needsUpdate = true;
            }
        }

        // OS BANCOS, numa InstancedMesh só. Caixa baixa e escura: a esta
        // distância um banco a sério não se distingue de uma caixa, e custava
        // mais geometria pelo mesmo pixel.
        if (bancos.length) {
            const B = F.grupos.banco;
            /*
            A caixa tem 1 m de altura e é a escala em Y de cada instância que
            lhe dá a altura do assento daquela pessoa — assim um funcionário
            mais alto não fica sentado no ar.
            */
            const im = new THREE.InstancedMesh(
                new THREE.BoxGeometry(B.largura, 1, B.profundidade),
                new THREE.MeshStandardMaterial({ color: B.cor, roughness: 0.9 }),
                bancos.length);
            im.castShadow = true;
            im.receiveShadow = false;
            im.frustumCulled = false;   // ver a nota acima
            bancos.forEach((b, i) => {
                dummy.position.set(b.x, b.altura / 2, b.z);
                dummy.rotation.set(0, b.rotY, 0);
                dummy.scale.set(1, b.altura, 1);
                dummy.updateMatrix();
                im.setMatrixAt(i, dummy.matrix);
            });
            im.instanceMatrix.needsUpdate = true;
            grupo.add(im);
        }

        this._grupo = grupo;
        return lugares.dePe.length + lugares.sentado.length;
    }
};

if (typeof window !== 'undefined') window.Staff = Staff;

/*
=============================================================================
GRUAS DE CÂMARA — a lança de televisão atrás de cada baliza
=============================================================================
Vive aqui e não no `createField` pela mesma razão que o `Staff`: é cenário do
recinto, construído uma vez, sem nada a correr por frame. E fica neste ficheiro
porque é do mesmo mundo dos repórteres atrás das placas — a grua é a câmara
deles, e as duas coisas partilham as medidas das placas.

As medidas e as cores estão no `GruaDeCamera` (config/physics.js), com o
desenho explicado. Aqui está a montagem: cada grua é um `Group` com a base, a
torre, a lança por cima da baliza, o contrapeso atrás e a cabeça da câmara na
ponta — e o grupo é rodado 180° na baliza oposta, em vez de haver duas versões
das mesmas contas com os sinais trocados.
=============================================================================
*/
const GruasDeCamera = {
    build(grupo, geo) {
        const G = (typeof GruaDeCamera !== 'undefined') ? GruaDeCamera : null;
        if (!G || !G.activo || !grupo || !geo) return 0;

        const matEstrutura = new THREE.MeshStandardMaterial({
            color: G.cores.estrutura, roughness: 0.55, metalness: 0.25
        });
        const matBase = new THREE.MeshStandardMaterial({ color: G.cores.base, roughness: 0.9 });
        const matPeso = new THREE.MeshStandardMaterial({ color: G.cores.contrapeso, roughness: 0.8 });
        const matCamara = new THREE.MeshStandardMaterial({ color: G.cores.camara, roughness: 0.4 });

        const caixa = (pai, mat, w, h, d, x, y, z) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            m.position.set(x, y, z);
            m.castShadow = true;
            m.receiveShadow = false;
            pai.add(m);
            return m;
        };

        /*
        A PENDURA DA CABEÇA. A câmara vive `PENDURA` metros debaixo da ponta da
        lança, e é essa diferença que se desconta ao inclinar o pivô — a altura
        pedida é a da CÂMARA e não a da ponta.
        */
        const PENDURA = 0.30;

        /*
        ONDE A BASE ASSENTA EM X — e é uma conta, não um número escrito.

        Pedido: *"a câmera da grua deve ficar no alinhamento do centro do
        gol"*. A lança corre paralela ao fundo, portanto a câmara está
        `comprimentoLanca * cos(theta)` metros da base: para ela cair no eixo
        (x = 0), a base tem de estar exactamente a essa distância dele.

        E O THETA MUDA A TODA A HORA (a lança sobe e desce com a bola), o
        cosseno com ele: entre os 2 e os 4 m de altura o alcance vai de 5.49 a
        5.23 m. Usa-se o ângulo do MEIO do percurso, e a câmara passeia ±13 cm
        em volta do eixo em vez de estar alinhada num extremo e 26 cm fora no
        outro. À distância a que ela filma a baliza, 13 cm não se vêem — o metro
        de desalinhamento que o `desvioX: 13` dava, via-se.
        */
        /*
        O ÂNGULO QUE PÕE A CÂMARA A UMA DADA ALTURA — e a pendura roda com a
        lança, que é a parte que sai errada na conta ingénua.

        A cabeça está em (0, -PENDURA, L) no espaço do pivô; inclinado de θ,
        isso dá

            y = alturaPivo - PENDURA·cos(θ) - L·sin(θ)

        e não `alturaPivo - PENDURA - L·sin(θ)`. A diferença são 2 cm no
        extremo de cima — pouco, mas é a diferença entre a altura pedida e a
        altura obtida, e estas duas contas (aqui e na `update`) têm de ser a
        MESMA, senão a base fica calculada para uma coisa e a lança faz outra.

        Resolve-se de uma vez: `PENDURA·cos(θ) + L·sin(θ) = R·sin(θ + φ)`, com
        `R = hypot(L, PENDURA)` e `φ = atan2(PENDURA, L)`.
        */
        const R_LANCA = Math.hypot(G.comprimentoLanca, PENDURA);
        const FASE_LANCA = Math.atan2(PENDURA, G.comprimentoLanca);
        const anguloPara = (altura) => {
            const sen = (G.alturaPivo - altura) / R_LANCA;
            return Math.asin(THREE.MathUtils.clamp(sen, -1, 1)) - FASE_LANCA;
        };
        this._anguloPara = anguloPara;
        const alcance = G.comprimentoLanca *
            Math.cos(anguloPara((G.alturaMin + G.alturaMax) / 2));

        /*
        UMA GRUA, montada com a lança a apontar para +Z. A baliza do outro lado
        recebe o mesmo grupo rodado meia volta: as contas são as mesmas e não há
        um segundo jogo de sinais para manter a par.
        */
        const montar = (pendura) => {
            const g = new THREE.Group();

            caixa(g, matBase, G.baseLargura, G.baseAltura, G.baseLargura,
                0, G.baseAltura / 2, 0);
            caixa(g, matEstrutura, G.larguraTorre, G.alturaPivo, G.larguraTorre,
                0, G.alturaPivo / 2, 0);

            /*
            A LANÇA E O CONTRAPESO SÃO FILHOS DO PIVÔ, e é o pivô que se
            inclina. Inclinar as duas peças à parte era ter de repetir a
            trigonometria em cada uma — e a ponta do contrapeso tem de subir
            exactamente o que a da lança desce, senão a grua fica torta.
            */
            const pivo = new THREE.Object3D();
            pivo.position.y = G.alturaPivo;
            /*
            NASCE À ALTURA DO MEIO do percurso, e não num ângulo escrito no
            config: é a `update` que manda na inclinação a partir da distância
            da bola, e um ângulo de repouso à parte só se veria no primeiro
            frame — e seria um terceiro número a ter de concordar com a
            `alturaMin` e a `alturaMax`.
            */
            pivo.rotation.x = anguloPara((G.alturaMin + G.alturaMax) / 2);
            g.add(pivo);

            caixa(pivo, matEstrutura, G.espessuraLanca, G.espessuraLanca,
                G.comprimentoLanca, 0, 0, G.comprimentoLanca / 2);
            caixa(pivo, matEstrutura, G.espessuraLanca, G.espessuraLanca,
                G.comprimentoContrapeso, 0, 0, -G.comprimentoContrapeso / 2);
            caixa(pivo, matPeso, G.contrapeso, G.contrapeso, G.contrapeso,
                0, 0, -G.comprimentoContrapeso);

            /*
            A CABEÇA DA CÂMARA pendura-se DEBAIXO da ponta e não em cima dela:
            é assim que uma grua a leva, e é o que a deixa a olhar para o
            relvado em vez de para o céu. A objectiva é um cilindro deitado —
            deitado quer dizer rodado em x, porque um CylinderGeometry nasce ao
            longo de Y.
            */
            const cabeca = new THREE.Object3D();
            cabeca.position.set(0, -pendura, G.comprimentoLanca);
            /*
            A CÂMARA OLHA PARA O CAMPO, e a lança é que corre ao lado dele: a
            rotação da cabeça é o que separa a direcção do BRAÇO da direcção do
            OLHAR. É só o modelo (a vista da tecla 8 aponta ao sítio da bola),
            mas uma câmara de cenário virada para a bancada estraga a leitura
            de tudo o resto.

            O ÂNGULO É ESCRITO NO `build`, que é quem sabe de que lado esta grua
            está: o olhar sai de `grupo + cabeça`, portanto depende da rotação
            do grupo — e essa mudou de sinal quando a base passou a assentar no
            alcance da lança. Um ângulo fixo aqui deixou as duas câmaras viradas
            para fora do estádio, e foi o teste que o apanhou.
            */
            pivo.add(cabeca);
            caixa(cabeca, matCamara, 0.34, 0.26, 0.34, 0, 0, 0);
            const lente = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 0.30, 12), matCamara);
            lente.rotation.x = Math.PI / 2;
            lente.position.set(0, 0, 0.26);
            lente.castShadow = true;
            cabeca.add(lente);

            /*
            A CABEÇA FICA GUARDADA no grupo: é o ponto de vista da câmara da
            grua (tecla 8) e é dela que o `build` lê a posição no mundo — sem
            isto, a vista tinha de repetir aqui fora a trigonometria do pivô.
            */
            /*
            O OLHO DA CAMARA, meio metro A FRENTE da cabeca.

            Relato, com captura de ecra: *"tem alguma coisa na frente da imagem
            da camera da grua"* — e uma mancha preta a tapar metade do ecra. Era
            a PROPRIA CAMARA: a vista estava no centro da cabeca, portanto a
            caixa dela (34 cm) e a objectiva (que avanca 41 cm) ficavam a
            envolver o ponto de vista. De dentro de uma caixa preta ve-se preto.

            0.60 m poe o olho a frente da ponta da objectiva com folga. E um
            no vazio, filho da cabeca: acompanha a rotacao e a subida da lanca
            sem uma segunda conta a repetir a trigonometria.
            */
            const olho = new THREE.Object3D();
            olho.position.set(0, 0, 0.60);
            cabeca.add(olho);

            g.userData.cabeca = cabeca;
            g.userData.olho = olho;
            // E o pivo: e ele que a `update` inclina para a lanca subir e
            // descer com a bola.
            g.userData.pivo = pivo;

            return g;
        };

        /*
        ATRÁS DE CADA BALIZA E PARALELA AO FUNDO. O `placaZ` já traz o recuo
        das placas de publicidade, portanto a grua acompanha-as se elas mudarem
        de sítio — a mesma regra do `Staff`.

        A lança é montada ao longo de +Z e é o GRUPO que roda um quarto de
        volta para a pôr ao longo de X: assim a montagem tem um só jogo de
        contas e o mesmo grupo serve as duas balizas. Uma rotação em Y de `a`
        leva o +Z local a (sin a, 0, cos a), portanto -90° aponta a lança para
        -X e +90° para +X — em cada baliza ela aponta para o EIXO, que é onde
        está a baliza que ela filma.

        E a câmara guarda-se: é ela que a vista da tecla 8 usa (ver o
        `cameraMode` 'grua' em match_ui.js). A posição é reescrita a cada frame
        pela `update`, porque a lança mexe-se.
        */
        this.cameras = [];
        this._pivos = [];
        const z = geo.placaZ + G.recuoDaPlaca;
        for (const lado of [-1, 1]) {
            const g = montar(PENDURA);
            // As duas ficam do mesmo lado do estádio visto de cima, como as
            // duas jibs de uma transmissão: é só simetria.
            const baseX = -lado * alcance;
            g.rotation.y = (baseX > 0) ? -Math.PI / 2 : Math.PI / 2;
            /*
            E A CÂMARA VIRA-SE PARA O RELVADO. O olhar acumula as duas
            rotações: `grupo + cabeça` tem de dar 0 na baliza de z negativo (o
            campo está em +Z) e meia volta na outra. Escrito assim, a conta
            continua certa se a rotação do grupo mudar de sinal outra vez.
            */
            g.userData.cabeca.rotation.y =
                (lado > 0 ? Math.PI : 0) - g.rotation.y;
            g.position.set(baseX, 0, lado * z);
            grupo.add(g);

            g.updateMatrixWorld(true);
            const pos = g.userData.olho.getWorldPosition(new THREE.Vector3());
            /*
            E A VISTA FICA NO EIXO DA BALIZA, sempre.

            A base assenta no alcance do angulo MEDIO (ver acima), portanto a
            ponta da lanca recolhe para dentro quando sobe: aos 6 m ela esta
            1.3 m para fora do eixo. O pedido — *"a camera da grua deve ficar
            no alinhamento do centro do gol"* — e sobre a IMAGEM, e um metro de
            desvio ve-se nela. O braco fica onde a mecanica o poe; o olho e
            travado no eixo.
            */
            pos.x = 0;
            this.cameras.push({ pos: pos, ladoZ: lado });
            this._pivos.push({
                pivo: g.userData.pivo,
                cabeca: g.userData.olho,
                ladoZ: lado,
                // A altura de onde ela parte, para a suavização ter de onde vir.
                altura: (G.alturaMin + G.alturaMax) / 2,
                pendura: PENDURA
            });

            /*
            NADA DISTO ENTRA NO CAMPO. A lança corre paralela ao fundo e a base
            está fora das placas, portanto a ponta fica no mesmo z da base — se
            algum dia deixar de ficar, é aqui que se sabe.
            */
            if (typeof LINHA_FUNDO === 'number' && Math.abs(pos.z) < LINHA_FUNDO &&
                typeof console !== 'undefined') {
                console.warn(`GruasDeCamera: a câmara entrou no campo (z=${pos.z.toFixed(1)})`);
            }
        }
        return 2;
    },

    /*
    =========================================================================
    A LANÇA SOBE E DESCE COM A BOLA
    =========================================================================
    Pedido: *"a grua deve subir e descer de acordo com o movimento da bola.
    Quanto mais longe a bola estiver, mais alto estará a grua"*. É o que um
    operador de jib faz — com a bola na área desce à altura dos jogadores, com
    a bola longe sobe para abrir o plano.

    A distância mede-se ao CENTRO DA BALIZA desta grua e não ao carrinho: é a
    baliza que ela filma, e é dela que a profundidade do plano depende. Entre
    `distanciaMin` e `distanciaMax` a altura vai de `alturaMin` a `alturaMax`,
    e fora desse intervalo fica saturada.

    A SUBIDA É SUAVIZADA AO TEMPO, com o mesmo `fatorSuavizacao` da câmara: a
    bola muda de distância aos metros por frame, e sem isto a lança dava saltos
    a cada passe. Uma jib não se mexe assim.

    Corre SEMPRE, e não só quando a vista da grua está escolhida: a grua é
    cenário à vista de todas as outras câmaras, e uma lança congelada ao lado de
    um jogo a mexer-se lê-se pior do que uma que não mexesse nunca.
    =========================================================================
    */
    update(dt) {
        const G = (typeof GruaDeCamera !== 'undefined') ? GruaDeCamera : null;
        if (!G || !G.activo || !this._pivos || !this._pivos.length) return;
        if (typeof Match === 'undefined' || !Match.ball) return;

        const bola = Match.ball.position;
        const linha = (typeof LINHA_FUNDO === 'number') ? LINHA_FUNDO : 53;
        const suave = (typeof fatorSuavizacao === 'function')
            ? fatorSuavizacao(G.suavizacao, dt || (1 / 60))
            : 0.06;

        this._pivos.forEach((gr, i) => {
            // Distância da bola ao centro da baliza que esta grua filma.
            const dz = bola.z - gr.ladoZ * linha;
            const d = Math.hypot(bola.x, dz);

            const t = THREE.MathUtils.clamp(
                (d - G.distanciaMin) / Math.max(0.001, G.distanciaMax - G.distanciaMin), 0, 1);
            const alvo = G.alturaMin + (G.alturaMax - G.alturaMin) * t;

            gr.altura += (alvo - gr.altura) * suave;

            /*
            O ângulo que põe a CÂMARA nessa altura. A conta vive no `build`
            (`_anguloPara`) e é a MESMA que escolheu onde a base assenta: a
            pendura da cabeça roda com a lança, e duas versões disto davam uma
            base calculada para uma altura e uma lança a fazer outra.
            */
            gr.pivo.rotation.x = this._anguloPara
                ? this._anguloPara(gr.altura)
                : 0;

            /*
            E A POSIÇÃO DA CÂMARA É RELIDA DO MUNDO, não recalculada: a vista da
            tecla 8 lê `cameras[i].pos`, e se essa posição fosse uma segunda
            conta feita aqui, o dia em que a geometria da grua mudasse a câmara
            ficava a flutuar ao lado dela.
            */
            gr.pivo.updateMatrixWorld(true);
            gr.cabeca.getWorldPosition(this.cameras[i].pos);
            // No eixo da baliza, pela razao que o `build` explica.
            this.cameras[i].pos.x = 0;
        });
    }
};

if (typeof window !== 'undefined') window.GruasDeCamera = GruasDeCamera;
