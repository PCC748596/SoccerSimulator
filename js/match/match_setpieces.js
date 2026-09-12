Object.assign(Match, {
    setupSetPiece: function (type, team) {
        this.mudarEstado(type, 'setpiece_' + type.toLowerCase());
        this.setPieceTeam = team;

        /*
        Qualquer bola parada mata as marcas de fora-de-jogo: elas valem para a
        jogada em que o passe saiu, e essa acabou. Sem isto um jogador ficava
        marcado atraves de um canto ou de um lateral, e era assinalado
        impedimento num lance onde a regra nem se aplica.
        */
        if (typeof Officials !== 'undefined' && Officials.limparImpedimento) {
            Officials.limparImpedimento();
        }

        /*
        A ETIQUETA DA MARCACAO, por cima do arbitro. Aqui e nao em cada
        `trigger*`: este e o unico sitio por onde TODOS os lances parados
        passam, incluindo os que vierem a ser escritos.

        Ver Officials.rotuloDaMarcacao — um estado sem nome de marcacao nao
        acende nada, e sem arbitros na cena isto nao faz nem rebenta.
        */
        /*
        APITO. Só o que o árbitro apita mesmo: falta e penálti. O canto, o
        lateral e o pontapé de baliza são reposições que o jogo retoma sozinho
        — apitar todas dava um apito a cada vinte segundos.
        */
        if (typeof EfeitosSonoros !== 'undefined' &&
            (type === 'FREE_KICK' || type === 'PENALTY')) {
            EfeitosSonoros.apito(1.0);
        }

        if (typeof Officials !== 'undefined' && Officials.anunciar) {
            Officials.anunciar(Officials.rotuloDaMarcacao(type));
            // E o braco: a direccao do ataque de quem beneficia, ou a marca de
            // penalti. Ver Officials.sinalizarMarcacao.
            if (Officials.sinalizarMarcacao) Officials.sinalizarMarcacao(type, team);
        }
        this.kickoffPendingPassToDef = false;
        
        // Ao marcar uma bola parada, a posse de bola já é da equipe que vai cobrar.
        if (this.possessionTeam !== team) {
            this.possessionTeam = team;
            this.possessionTimer = 0;
            this.counterAttackTeam = null;
            this.counterAttackTimer = 0;

            // Força a atualização da IA tática (blocos e baseTargets) imediatamente
            // com a nova posse de bola. Assim, quem vai defender a bola parada não
            // usa os alvos velhos da jogada de ataque anterior.
            if (typeof TeamAI !== 'undefined') {
                TeamAI.tick('TeamA', this);
                TeamAI.tick('TeamB', this);
            }
        }

        this.setPieceTimer = 0;
        // GOAL_KICK é excepção: a bola continua com a velocidade que trazia
        // até tocar no chão + 3s (ver o teleporte próprio mais abaixo) — zerar
        // aqui, incondicional pra qualquer bola parada, matava esse
        // movimento no MESMO frame em que ela saía, antes mesmo de chegar
        // lá. Os outros tipos (canto, lateral) continuam a travar já.
        /*
        GOAL_KICK e CORNER_KICK são excepção: a bola continua com a velocidade
        que trazia até tocar no chão (ver o countdown em update()). Zerar aqui
        matava o movimento no MESMO frame em que ela saía — um remate que batia
        no poste e ia para trás da baliza congelava no ar e aparecia no canto.
        Os outros tipos (lateral) travam já.
        */
        if (type !== 'GOAL_KICK' && type !== 'CORNER_KICK') this.ballVel.set(0, 0, 0);
        this.intendedReceiver = null;
        this.passTargetPos = null;

        if (typeof MatchStats !== 'undefined' && MatchStats[team]) {
            if (type === 'CORNER_KICK') MatchStats[team].cantos++;
            // O `pontapesBaliza` estava declarado e exportado sem NINGUEM o
            // incrementar — o zero do relatorio nao era um resultado.
            if (type === 'GOAL_KICK') MatchStats[team].pontapesBaliza++;
        }

        let attackingPlayers = (team === 'TeamA') ? this.players : this.opponents;
        let defendingPlayers = (team === 'TeamA') ? this.opponents : this.players;

        let attDir = (team === 'TeamA') ? 1 : -1;
        let defDir = -attDir;

        if (type === 'CORNER_KICK') {
            /*
            Geometria toda no pontoDeCanto (config.js): a bola na quina e no
            chão, quem bate FORA do campo e atrás dela, e o ponto da área para
            onde ele olha. Estava aqui à mão, com o batedor 1.5 m para DENTRO
            das duas linhas e virado para a bandeirola — de costas para a área.
            */
            const canto = pontoDeCanto(this.ball.position.x, attDir);
            const flagX = canto.bola.x;
            const flagZ = canto.bola.z;

            /*
            A bola NÃO é teleportada aqui. Fica a correr o resto do lance — cai,
            ressalta, passa para trás da baliza — e só depois é reposta na quina
            (ver o countdown do canto em update()). Mesma ideia do tiro de meta.
            */
            /*
            O lance ainda não está vivo: só passa a estar quando a bola sai do
            pé (ver o case SET_PIECE_TAKER na fsm.js). Limpa-se aqui para um
            canto novo não herdar o do anterior.
            */
            this.cantoVivo = null;

            this.cantoBolaAlvo = { x: canto.bola.x, y: canto.bola.y, z: canto.bola.z };
            this.cantoAguardaChao = true;
            this.cantoBolaAtraso = 1.2;

            /*
            Ninguém segura a bola numa bola parada. Sem isto o `hasBall` de
            quem tocou por último sobrevive ao apito e o player.update()
            continua a colar a bola a ele — no caso do guarda-redes, à altura
            do PEITO. Era a bola fora do chão que se via no canto.
            */
            this.players.concat(this.opponents).forEach(p => { p.hasBall = false; });
            this.ballCarrier = null;

            let taker = null;
            let minDist = 999;
            attackingPlayers.forEach(p => {
                if (p.role !== 'gk') {
                    let d = p.model.position.distanceTo(this.ball.position);
                    if (d < minDist) { minDist = d; taker = p; }
                }
            });

            /*
            SEM BATEDOR DE CAMPO não se rebenta: acontece com a equipa
            reduzida a onze menos expulsos, ou num estado em que a lista de
            atacantes só tem o guarda-redes. A linha seguinte fazia
            `null.hasBall` e derrubava o jogo inteiro — apanhado a correr o
            lote de laterais.

            O guarda-redes bate o canto, que é feio mas é jogo; sem ninguém
            de todo, sai-se e o lance fica onde está.
            */
            if (!taker) taker = attackingPlayers.find(p => p.model) || null;
            if (!taker) return;

            this.setPieceTaker = taker;
            this.setPieceTaker.hasBall = false;

            // O alvo na área fica guardado: o SET_PIECE_TAKER volta a virá-lo
            // para lá todos os frames, e é para lá que ele centra.
            if (!this.cornerAlvo) this.cornerAlvo = new THREE.Vector3(); this.cornerAlvo.set(canto.alvo.x, ALTURA_BASE_Y, canto.alvo.z);

            taker.model.position.set(canto.batedor.x, ALTURA_BASE_Y, canto.batedor.z);
            lookAtBola(taker.model, this.cornerAlvo);
            taker.fsm.changeState('SET_PIECE_TAKER');

            const lado = Math.sign(this.ball.position.x) || 1;
            const linhaZ = attDir * (CAMPO_COMP / 2);

            // ==========================================
            // POSICIONAMENTO DO ATAQUE (9 jogadores de linha + batedor + GR)
            // ==========================================
            /*
            Geometria de referência (canto real): o miolo do ataque é um
            aglomerado APERTADO entre a linha da pequena área (5.5 m) e a marca
            de penálti (11 m), não uma fila espalhada pela área. Cada um destes
            slots tem o seu marcador em defenseSetup, a 1-1.5 m do lado da
            baliza — os dois arrays andam a par, mexer num pede mexer no outro.

            `initial` é onde ele espera pelo lance, `target` para onde ataca
            quando a bola sai: o movimento é sempre de FORA para DENTRO e da
            profundidade para a bola, que é como se ganha o corpo ao marcador.

            relX é medido do eixo da baliza, com sinal do lado do canto
            (+ = lado do batedor). Postes em ±3.66, pequena área em ±9.16.
            */
            const attackSetup = [
                // 1. Primeiro pau: entra a atacar a bola à frente do marcador
                { initial: { relX: 2.5, dist: 7.5 }, target: { relX: 3.6, dist: 4.5 } },
                // 2. Coração da área, à altura da marca de penálti
                { initial: { relX: 0.0, dist: 11.0 }, target: { relX: 0.0, dist: 8.0 } },
                // 3. Segundo pau: ataca de trás para a frente
                { initial: { relX: -4.5, dist: 8.5 }, target: { relX: -3.6, dist: 5.5 } },
                // 4. Segunda vaga central (chega atrasado à marca de penálti)
                { initial: { relX: 1.5, dist: 14.0 }, target: { relX: 1.5, dist: 11.0 } },
                // 5. Segunda vaga do lado oposto
                { initial: { relX: -2.5, dist: 13.0 }, target: { relX: -2.0, dist: 10.0 } },
                // 6. Em cima do guarda-redes, na linha da pequena área
                { initial: { relX: 1.0, dist: 6.5 }, target: { relX: 1.0, dist: 5.0 } },
                // 7. Sobra na entrada da área (meia-lua), para o ressalto
                { initial: { relX: 0.5, dist: 19.0 }, target: { relX: 0.5, dist: 17.5 } },
                // 8. Aberto no vértice da área, do lado do batedor
                { initial: { relX: 8.0, dist: 18.0 }, target: { relX: 7.0, dist: 16.5 } },
                // 9. Último homem / segurança defensiva
                { initial: { relX: 0.5, dist: 36.0 }, target: { relX: 0.5, dist: 34.0 } }
            ];

            let attackersInBox = attackingPlayers.filter(p => p !== taker && p.role !== 'gk');
            /*
            Ordena atacantes de modo que atacantes/médios ofensivos/zagueiros altos
            fiquem na área e laterais/volantes na sobra/segurança.

            `juntaSeAoAtaque` (Extra Frontman) conta como avançado SÓ AQUI: é
            este o momento em que o central sobe — compor a área e disputar o
            cabeceio na bola parada. Em jogo corrido o estilo não o desloca
            (ver extra_frontman em config.js). Sem isto ele caía no bloco
            'def' e ia parar à sobra ou ao último homem, a 34 m da baliza.
            */
            const subiuAoAtaque = (p) => (typeof estiloAtivoDe === 'function') &&
                !!estiloAtivoDe(p).juntaSeAoAtaque;
            attackersInBox.sort((a, b) => {
                const roleOrder = { 'ata': 1, 'mid': 2, 'def': 3 };
                const nota = (p) => subiuAoAtaque(p) ? 1 : (roleOrder[p.role] || 2);
                return nota(a) - nota(b);
            });

            attackersInBox.forEach((p, idx) => {
                const cfg = attackSetup[idx] || attackSetup[attackSetup.length - 1];
                const initX = lado * cfg.initial.relX;
                const initZ = linhaZ - attDir * cfg.initial.dist;
                const tgtX = lado * cfg.target.relX;
                const tgtZ = linhaZ - attDir * cfg.target.dist;

                p.model.position.set(initX, ALTURA_BASE_Y, initZ);
                p.dynamicTarget.set(tgtX, ALTURA_BASE_Y, tgtZ);
                p.setPieceTarget = new THREE.Vector3().copy(p.dynamicTarget);
                // Âncora da disputa antes da batida (ver SET_PIECE_WAIT na FSM).
                p.jostleAncora = { x: initX, z: initZ };
                p.jostleAngulo = Math.random() * Math.PI * 2;
                p.jostleRaio = Math.random() * SetPieceJostle.raio;
                p.jostleTimer = Math.random() * SetPieceJostle.intervaloMax;
                p.fsm.changeState('SET_PIECE_WAIT');
                lookAtBola(p.model, this.ball.position);
            });

            // ==========================================
            // POSICIONAMENTO DA DEFESA (10 jogadores de linha + GR)
            // ==========================================
            /*
            Defesa: dois homens nos postes, um marcador por cada atacante do
            aglomerado (sempre do lado da BALIZA em relação ao homem dele, ~1.5 m
            à frente), um na entrada da área para o ressalto e um saída no campo.

            Os índices 3-8 emparelham com os slots 1-6 do attackSetup pela mesma
            ordem. Se mexeres num array, mexe no outro.
            */
            const defenseSetup = [
                // 1. Primeiro pau, em cima da linha
                { relX: 3.4, dist: 0.6, tgt: { relX: 3.4, dist: 0.6 } },
                // 2. Segundo pau, em cima da linha
                { relX: -3.4, dist: 0.6, tgt: { relX: -3.4, dist: 0.6 } },
                // 3. Marca o atacante do primeiro pau (att 1)
                { relX: 3.4, dist: 5.8, tgt: { relX: 3.6, dist: 3.2 } },
                // 4. Marca o do coração da área (att 2)
                { relX: 0.0, dist: 9.2, tgt: { relX: 0.0, dist: 6.6 } },
                // 5. Marca o do segundo pau (att 3)
                { relX: -4.2, dist: 6.8, tgt: { relX: -3.6, dist: 4.2 } },
                // 6. Marca a segunda vaga central (att 4)
                { relX: 1.5, dist: 12.2, tgt: { relX: 1.5, dist: 9.6 } },
                // 7. Marca a segunda vaga do lado oposto (att 5)
                { relX: -2.5, dist: 11.2, tgt: { relX: -2.0, dist: 8.6 } },
                // 8. Zona da pequena área, à frente do guarda-redes (att 6)
                { relX: 1.0, dist: 4.2, tgt: { relX: 1.0, dist: 3.6 } },
                // 9. Entrada da área: corta o ressalto e o corner curto
                { relX: 2.0, dist: 16.5, tgt: { relX: 1.5, dist: 15.5 } },
                // 10. Saída: fica no campo para o contra-ataque
                { relX: 1.0, dist: 30.0, tgt: { relX: 1.0, dist: 30.0 } }
            ];

            let defendersInBox = defendingPlayers.filter(p => p.role !== 'gk');
            /*
            Ordena ao contrário do ataque: defesas e médios ocupam postes e
            marcações dentro da área, o avançado sobra para o slot 10 (saída no
            campo). Sem isto o slot era pela ordem do plantel — um avançado
            podia ficar no poste e um central lá longe no meio-campo.
            */
            defendersInBox.sort((a, b) => {
                const roleOrder = { 'def': 1, 'mid': 2, 'ata': 3 };
                return (roleOrder[a.role] || 2) - (roleOrder[b.role] || 2);
            });
            /*
            QUEM MARCA QUEM. Os slots 3-8 da defesa emparelham com os slots 1-6
            do ataque (ver os comentários dos dois arrays); guarda-se o par para
            a marcação sobreviver à batida — ver CornerDefenseModel e o ramo do
            canto no PlayerAI.tick. Sem isto o emparelhamento existia só na
            geometria inicial e desfazia-se no instante do cruzamento.
            */
            defendingPlayers.concat(attackingPlayers).forEach(p => { p.marcaNoCanto = null; });

            defendersInBox.forEach((p, idx) => {
                const cfg = defenseSetup[idx] || defenseSetup[defenseSetup.length - 1];
                // idx 2..7 são os seis marcadores; att 0..5 os seis homens da área.
                if (idx >= 2 && idx <= 7) p.marcaNoCanto = attackersInBox[idx - 2] || null;
                const initX = lado * cfg.relX;
                const initZ = linhaZ - attDir * cfg.dist;
                const tgtX = lado * cfg.tgt.relX;
                const tgtZ = linhaZ - attDir * cfg.tgt.dist;

                p.model.position.set(initX, ALTURA_BASE_Y, initZ);
                p.dynamicTarget.set(tgtX, ALTURA_BASE_Y, tgtZ);
                p.jostleAncora = { x: initX, z: initZ };
                p.jostleAngulo = Math.random() * Math.PI * 2;
                p.jostleRaio = Math.random() * SetPieceJostle.raio;
                p.jostleTimer = Math.random() * SetPieceJostle.intervaloMax;
                p.fsm.changeState('SET_PIECE_WAIT');
                lookAtBola(p.model, this.ball.position);
            });

            // O guarda-redes não disputa posição: fica na linha.
            [defendingPlayers, attackingPlayers].forEach(lista => {
                const g = lista.find(p => p.role === 'gk');
                if (g) g.jostleAncora = null;
            });

            let defGK = defendingPlayers.find(p => p.role === 'gk');
            if (defGK) {
                defGK.model.position.set(0, ALTURA_BASE_Y, linhaZ - attDir * 1.5);
                defGK.dynamicTarget.set(0, ALTURA_BASE_Y, linhaZ - attDir * 2.0);
                lookAtBola(defGK.model, this.ball.position);
                defGK.fsm.changeState('SET_PIECE_WAIT');
            }

            let attGK = attackingPlayers.find(p => p.role === 'gk');
            if (attGK) {
                attGK.model.position.set(0, ALTURA_BASE_Y, -linhaZ + attDir * 2.0);
                attGK.dynamicTarget.set(0, ALTURA_BASE_Y, -linhaZ + attDir * 2.0);
                lookAtBola(attGK.model, this.ball.position);
                attGK.fsm.changeState('SET_PIECE_WAIT');
            }

        } else if (type === 'THROW_IN') {
            /*
            LATERAL. A bola volta ao ponto da linha por onde saiu (z travado
            para não ficar em cima da bandeirola de canto), e repõe o jogador
            de campo mais perto desse ponto.

            Não se mexe nos outros dez: o nível 2 continua ligado no THROW_IN
            (ver nivel2Activo), portanto eles reorganizam-se sozinhos com o
            bloco em vez de irem para slots escritos à mão como no canto.
            */
            const ladoLinha = Math.sign(this.ball.position.x) || 1;
            const zLinha = THREE.MathUtils.clamp(this.ball.position.z,
                -(CAMPO_COMP / 2 - 1.0), CAMPO_COMP / 2 - 1.0);
            const xLinha = ladoLinha * (CAMPO_LARG / 2);

            this.ball.position.set(xLinha, BallPhysics.raio, zLinha);
            this.ballVel.set(0, 0, 0);

            this.players.concat(this.opponents).forEach(p => { p.hasBall = false; });
            this.ballCarrier = null;

            // Ordem do batedor: lateral, medio da ala, CM — ver
            // escolherBatedorDoLateral e ThrowInModel.ordemBatedor.
            const taker = escolherBatedorDoLateral(attackingPlayers, this.ball.position);
            this.setPieceTaker = taker || null;

            if (taker) {
                // Fica FORA do campo, atrás da linha, como manda a regra.
                taker.model.position.set(
                    ladoLinha * (CAMPO_LARG / 2 + ThrowInModel.recuoDaLinha),
                    ALTURA_BASE_Y, zLinha);
                taker.hasBall = false;
                taker.lateralAction = null;
                taker.lateralLargou = false;
                taker.fsm.changeState('LATERAL');
            }

            /*
            Adversários a menos de `afastaAdversarios` da bola dão um passo
            atrás — a regra manda 2 m, e sem isto ficavam colados ao batedor
            porque o slot do bloco os punha ali.
            */
            defendingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                const dx = p.model.position.x - xLinha;
                const dz = p.model.position.z - zLinha;
                const d = Math.hypot(dx, dz);
                if (d > 0.001 && d < ThrowInModel.afastaAdversarios) {
                    const k = ThrowInModel.afastaAdversarios / d;
                    p.model.position.x = xLinha + dx * k;
                    p.model.position.z = zLinha + dz * k;
                }
            });

            this.lateralPendente = true;
            this.lateralAtraso = ESPERA_APOS_REPOSICAO;

        } else if (type === 'FREE_KICK') {
            /*
            FALTA. A bola fica onde está — é esse o ponto da infracção. Cobra o
            jogador da equipa beneficiada mais perto dela; a defesa monta
            barreira na linha bola->baliza, à distância regulamentar, e quem
            estiver mais perto do que isso é afastado.
            */
            const F = FreeKickModel;
            const bolaFK = this.ball.position.clone();
            bolaFK.y = BallPhysics.raio;
            this.ball.position.copy(bolaFK);

            this.players.concat(this.opponents).forEach(p => { p.hasBall = false; });
            this.ballCarrier = null;

            // Direcção da bola para a baliza atacada — serve para o batedor
            // (atrás da bola) e para a barreira (à frente dela).
            const golFK = new THREE.Vector3(0, 0, attDir * (CAMPO_COMP / 2));
            const dirFK = new THREE.Vector3().subVectors(golFK, bolaFK);
            dirFK.y = 0;
            if (dirFK.lengthSq() < 0.0001) dirFK.set(0, 0, attDir);
            dirFK.normalize();
            const perpFK = new THREE.Vector3(-dirFK.z, 0, dirFK.x);

            /*
            QUEM BATE. Era o mais PERTO da bola — a cobrança calhava a quem a
            jogada tinha deixado ali, e via-se um central a bater uma falta na
            entrada da área adversária.

            Agora sai do sector (FreeKickModel.batedorPorSetor): na defesa e no
            meio-campo recuado batem os DEFENSORES (o de melhor Técnica), do
            meio-campo para a frente bate o melhor técnico NÃO-defensor, e no
            cruzamento pela ala bate o LATERAL — porque os centrais e os pontas
            queremo-los dentro da área a atacar a bola.

            A decisão da bola calcula-se aqui em cima porque o sector de ataque
            depende dela: cruzar e rematar não têm o mesmo desenho.
            */
            /*
            LIVRE INDIRECTO (fora-de-jogo): nao se pode rematar directamente a
            baliza, portanto a decisao cai para o passe. A bandeira e posta por
            quem marca a infraccao e consome-se aqui.
            */
            const indirecta = !!this.faltaIndirecta;
            this.faltaIndirecta = false;
            const decisaoFK = indirecta ? 'passe'
                : ((typeof decisaoDeFalta === 'function')
                    ? decisaoDeFalta(bolaFK.x, bolaFK.z, attDir) : 'passe');
            const setorPreliminar = (typeof setorDaFalta === 'function')
                ? setorDaFalta(bolaFK.x, bolaFK.z, attDir, decisaoFK) : 'meio_avancado';
            const criterioFK = (F.batedorPorSetor && F.batedorPorSetor[setorPreliminar]) || 'naoDef';

            const takerFK = (typeof batedorDaFalta === 'function')
                ? batedorDaFalta(attackingPlayers, criterioFK, p => p.skillFor('TEC'))
                : null;
            this.setPieceTaker = takerFK || null;

            if (takerFK) {
                takerFK.model.position.set(
                    bolaFK.x - dirFK.x * F.recuoBatedor, ALTURA_BASE_Y,
                    bolaFK.z - dirFK.z * F.recuoBatedor);
                takerFK.velocity.set(0, 0, 0);
                lookAtBola(takerFK.model, bolaFK);
                takerFK.fsm.changeState('SET_PIECE_WAIT');
                
                // Guarda o ponto onde o gesto de remate vai arrancar, para a aproximação andada
                takerFK.alvoFalta = new THREE.Vector3(
                    bolaFK.x - dirFK.x * F.arranqueDoGesto,
                    ALTURA_BASE_Y,
                    bolaFK.z - dirFK.z * F.arranqueDoGesto
                );
            }

            /*
            Barreira: quantidade de defensores pela distância ao centro do gol.
            - Mais de 30 metros: 1 na barreira
            - Mais de 26 metros (até 30m): 2 na barreira
            - 26 metros ou menos: barreira cheia (4 jogadores)
            Quando a falta é direta/no terço ofensivo, a barreira cobre o lado do poste
            mais próximo da bola, e o goleiro desloca-se ligeiramente para o lado oposto da barreira.
            */
            // Avanço da bola no eixo de ataque: negativo no campo próprio,
            // positivo no adversário. É por ele que se lê o sector (ver
            // FreeKickModel.setores) — usado mais abaixo, no guarda-redes.
            const avancoFK = bolaFK.z * attDir;

            const distGolFK = Math.hypot(bolaFK.x - golFK.x, bolaFK.z - golFK.z);
            let nBarreira = F.barreiraMax || 4;
            /*
            NUM FORA-DE-JOGO NÃO HÁ BARREIRA. O livre é indirecto e quase
            sempre longe da baliza: o que se monta é um recomeço, e quem o
            monta é a `formaDoLivreDeImpedimento` lá em baixo.
            */
            if (indirecta) nBarreira = 0;
            if (distGolFK > (F.barreira1MaxDist !== undefined ? F.barreira1MaxDist : 30.0)) {
                nBarreira = 1;
            } else if (distGolFK > (F.barreira2MaxDist !== undefined ? F.barreira2MaxDist : 26.0)) {
                nBarreira = 2;
            }

            // Determina de que lado a barreira protege (lado do poste correspondente ao lado da bola)
            // Se bolaFK.x > 0 (lado direito do ataque), barreira alinha cobrindo o poste direito (x > 0).
            // Se bolaFK.x < 0, cobre o poste esquerdo (x < 0). Se central, cobre o centro/lado mais próximo.
            const ladoBarreira = Math.sign(bolaFK.x) || 1;
            const offsetCentroBarreira = (Math.abs(bolaFK.x) > 3.0) ? ladoBarreira * 0.45 : 0;

            const defesaOrdenada = defendingPlayers
                .filter(p => p.role !== 'gk')
                .sort((a, b) => a.model.position.distanceTo(bolaFK) - b.model.position.distanceTo(bolaFK));

            /*
            QUEM ESTÁ NA BARREIRA fica marcado e guardado: é essa lista que
            leva o `touchLock` na batida (senão o `resolveBallContact` dava-lhes
            o toque por acidente e o desfecho sorteado nunca acontecia), que
            salta ao ser batida e que o desvio lê. Ver o ramo
            `faltaDirectaPlano` no Match.update e `executarFalta` em player.js.
            */
            this.players.concat(this.opponents).forEach(p => { p.naBarreiraFalta = false; });
            this.faltaDirectaBarreira = [];

            defesaOrdenada.forEach((p, i) => {
                if (i < nBarreira) {
                    const off = (i - (nBarreira - 1) / 2) * F.espacamentoBarreira + offsetCentroBarreira;
                    p.model.position.set(
                        bolaFK.x + dirFK.x * F.distanciaBarreira + perpFK.x * off, ALTURA_BASE_Y,
                        bolaFK.z + dirFK.z * F.distanciaBarreira + perpFK.z * off);
                    p.naBarreiraFalta = true;
                    this.faltaDirectaBarreira.push(p);
                }
                /*
                O `else` que aqui estava — "só não pode estar mais perto do que
                9.15 m" — era tudo o que a equipa que defende recebia, e por
                isso nove dos dez ficavam onde a jogada anterior os deixara.
                Passa a ser a `formaDaDefesaNoLivre`, chamada a seguir, que os
                arruma; ela já respeita os 9.15 m pelo `FreeKickShape.de`.
                */
                lookAtBola(p.model, bolaFK);
                p.fsm.changeState('SET_PIECE_WAIT');
            });

            // E os que NÃO ficaram na barreira, que eram a metade sem dono.
            if (!indirecta) this.formaDaDefesaNoLivre(defendingPlayers, bolaFK, dirFK);

            /*
            POSICIONAMENTO DO GOLEIRO NA FALTA:
            Quando há barreira protegendo um lado do gol, o goleiro fica ligeiramente
            deslocado do centro do gol para o lado oposto da barreira (visão desobstruída do batedor).
            */
            const defendingTeam = (team === 'TeamA') ? 'TeamB' : 'TeamA';
            const gkDefensor = defendingPlayers.find(p => p.role === 'gk');
            if (gkDefensor) {
                let gkOffX = 0;
                if (avancoFK > F.setores.tercoDefensivo) {
                    // Desloca para o lado oposto da barreira: se barreira está no lado X > 0, GK vai para X < 0
                    gkOffX = -ladoBarreira * F.deslocamentoGK;
                    // Limita dentro da largura da baliza
                    gkOffX = THREE.MathUtils.clamp(gkOffX, -LARGURA_BALIZA / 2 + 0.6, LARGURA_BALIZA / 2 - 0.6);
                }
                const linhaBalizaZ = attDir * (CAMPO_COMP / 2) - attDir * 0.4;
                gkDefensor.model.position.set(gkOffX, ALTURA_BASE_Y, linhaBalizaZ);
                gkDefensor.dynamicTarget.set(gkOffX, ALTURA_BASE_Y, linhaBalizaZ);
                gkDefensor.velocity.set(0, 0, 0);
                gkDefensor.gkEstado = 'idle';
                gkDefensor.gkReagiu = false;
                gkDefensor.dive = null;
                lookAtBola(gkDefensor.model, bolaFK);
                gkDefensor.resetBonesToDefault();
                gkDefensor.fsm.changeState('SET_PIECE_WAIT');
            }

            /*
            ==========================================================
            ONDE SE PÕE A EQUIPA QUE COBRA
            ==========================================================
            Antes só o batedor e cinco homens na área eram colocados, e só a
            partir do `zonaDeArea` — nas outras faltas os dez ficavam onde a
            jogada os tinha deixado. Uma falta na própria defesa tinha o mesmo
            desenho de uma falta ao lado da área: nenhum.

            Agora o desenho sai do SECTOR (ver setorDaFalta e
            FreeKickModel.formacaoPorSetor). Os lugares são geometria pura e
            vivem no `lugaresDaFalta` (utils.js), para se poderem medir sem
            montar um jogo.

            O `dynamicTarget` é escrito a par da posição: sem ele o nível 1
            reescreve o alvo no frame seguinte e eles saem todos do lugar antes
            de a bola ser batida.
            */
            const setorFK = setorDaFalta(bolaFK.x, bolaFK.z, attDir, decisaoFK);
            this.setorDaFaltaActual = setorFK;

            const restantes = attackingPlayers.filter(p => p !== takerFK && p.role !== 'gk');
            const lugares = lugaresDaFalta(bolaFK.x, bolaFK.z, attDir, restantes, setorFK);

            /*
            O CORREDOR DA COBRANÇA FICA LIVRE (ver FreeKickModel.corredorLivre).

            Numa falta que acaba em REMATE, os lugares do `lugaresDaFalta`
            punham companheiros do batedor em cima da linha bola->baliza: os
            dois avançados do `ataque_entrada` esperam o ressalto a 13.5 m da
            linha de fundo e a 2.5 m do eixo, o que numa falta a 20 m os deixa
            À FRENTE DA BARREIRA e no caminho da bola. Medido em 60 cobranças:
            87% com um companheiro dentro do corredor, o mais perto a 7.0 m da
            bola — a barreira está a 9.15.

            Quem lá está é empurrado de LADO até à borda do corredor, mantendo
            a mesma profundidade: continua a atacar o ressalto, mas de onde se
            espera um ressalto em campo. O empurrão é lateral e não para trás
            porque a profundidade é que diz o que ele lá vai fazer.
            */
            const foraDoCorredor = (x, z) => {
                if (decisaoFK !== 'remate') return { x: x, z: z };
                const meia = (F.corredorLivre !== undefined) ? F.corredorLivre : 5.0;
                const rx = x - bolaFK.x, rz = z - bolaFK.z;
                const compFK = Math.hypot(golFK.x - bolaFK.x, golFK.z - bolaFK.z) || 1;
                const aoLongo = rx * dirFK.x + rz * dirFK.z;
                if (aoLongo <= 0.5 || aoLongo >= compFK) return { x: x, z: z };
                const lateral = rx * perpFK.x + rz * perpFK.z;
                if (Math.abs(lateral) >= meia) return { x: x, z: z };
                // Para o lado mais perto; em cima da linha, para o lado
                // contrário ao de onde se bate (é o lado que a barreira fecha).
                const sinal = (Math.abs(lateral) > 0.05)
                    ? Math.sign(lateral) : -(Math.sign(bolaFK.x) || 1);
                return {
                    x: bolaFK.x + dirFK.x * aoLongo + perpFK.x * sinal * meia,
                    z: bolaFK.z + dirFK.z * aoLongo + perpFK.z * sinal * meia
                };
            };

            /*
            E NINGUEM FICA EM CIMA DA BOLA — ver FreeKickModel.folgaDaBola.

            O `foraDoCorredor` acima so mexe em quem esta no caminho
            bola->baliza, e so quando a decisao e remate. Quem calha a um metro
            da bola num passe curto nao era empurrado por ninguem: medido, 1 em
            105 cobrancas tinha um companheiro a 1.44 m. Este empurrao e
            RADIAL, para fora da bola, e mantem a direccao em que ele estava.
            */
            const folgaDaBolaFK = (typeof F.folgaDaBola === 'number') ? F.folgaDaBola : 0;
            const foraDaBola = (x, z) => {
                if (folgaDaBolaFK <= 0) return { x: x, z: z };
                const rx = x - bolaFK.x, rz = z - bolaFK.z;
                const d = Math.hypot(rx, rz);
                if (d >= folgaDaBolaFK) return { x: x, z: z };
                // Em cima da bola nao ha direccao: afasta-o para tras do batedor.
                if (d < 0.001) {
                    return { x: bolaFK.x - dirFK.x * folgaDaBolaFK, z: bolaFK.z - dirFK.z * folgaDaBolaFK };
                }
                const k = folgaDaBolaFK / d;
                return { x: bolaFK.x + rx * k, z: bolaFK.z + rz * k };
            };

            lugares.forEach(l => {
                const p = l.p;
                const noCorredor = foraDoCorredor(l.x, l.z);
                const ajustado = foraDaBola(noCorredor.x, noCorredor.z);
                l.x = THREE.MathUtils.clamp(ajustado.x, -(CAMPO_LARG / 2 - 2), CAMPO_LARG / 2 - 2);
                l.z = THREE.MathUtils.clamp(ajustado.z, -(CAMPO_COMP / 2 - 2), CAMPO_COMP / 2 - 2);
                p.model.position.set(l.x, ALTURA_BASE_Y, l.z);
                p.dynamicTarget.set(l.x, ALTURA_BASE_Y, l.z);
                p.setPieceTarget = new THREE.Vector3(l.x, ALTURA_BASE_Y, l.z);
                /*
                A disputa de posição (jostle) só para quem ataca a área: no
                meio-campo não há ninguém em cima deles para disputar, e o
                passo-à-volta-da-âncora lia-se como indecisão.
                */
                if (setorFK === 'ataque_lateral' || setorFK === 'ataque_entrada') {
                    p.jostleAncora = { x: l.x, z: l.z };
                    p.jostleAngulo = Math.random() * Math.PI * 2;
                    p.jostleRaio = Math.random() * SetPieceJostle.raio;
                    p.jostleTimer = Math.random() * SetPieceJostle.intervaloMax;
                } else {
                    p.jostleAncora = null;
                }
                p.fsm.changeState('SET_PIECE_WAIT');
                lookAtBola(p.model, bolaFK);
            });

            /*
            E OS MARCADORES da defesa, só quando há área para marcar. Os
            defensores que SOBRAM da barreira — ela é obrigação e vem primeiro.
            Sem isto os atacantes ficavam na área sozinhos, que é tão irreal
            como a área vazia.

            O afastamento dos 9.15 m corre DEPOIS disto (ver mais abaixo): estes
            slots são medidos da linha de fundo e não sabem onde está a bola.
            */
            if (setorFK === 'ataque_lateral' || setorFK === 'ataque_entrada') {
                const ladoFK = Math.sign(bolaFK.x) || 1;
                const linhaFundoFK = attDir * LINHA_FUNDO;
                const naArea = lugares.filter(l => Area.contem(l.x, l.z, linhaFundoFK));
                const livres = defesaOrdenada.slice(nBarreira);
                for (let i = 0; i < naArea.length && i < livres.length && i < F.slotsMarcacao.length; i++) {
                    const cfg = F.slotsMarcacao[i];
                    const d = livres[i];
                    d.model.position.set(
                        ladoFK * cfg.relX, ALTURA_BASE_Y,
                        linhaFundoFK - attDir * cfg.dist);
                    // Marcação POSICIONAL: o slot é que emparelha com o do
                    // atacante. O `markingTarget` não serve aqui — está
                    // atribuído em vários sítios e não é lido por ninguém.
                    lookAtBola(d.model, bolaFK);
                    d.fsm.changeState('SET_PIECE_WAIT');
                }
            }

            /*
            FALTA DE ATAQUE DENTRO DA ÁREA ADVERSÁRIA: OS INFRACTORES RECUAM.

            Relato: "os jogadores estão ficando dentro da área e não estão
            marcando ninguém". Neste lance quem cobra é a equipa que defendia e
            a bola está no fundo do campo dela — sector `defesa`, que não tem
            `slotsMarcacao` — portanto os infractores ficavam onde a jogada de
            ataque os tinha deixado: dentro da área, sem homem. O único ajuste
            era o empurrão dos 9.15 m, que afasta da bola e mais nada.

            Os lugares são geometria pura (`lugaresDoInfratorNaArea`, utils.js):
            cada um pega no adversário mais perto, coloca-se do lado da própria
            baliza em relação a ele, e sai da área. A barreira não entra — ela é
            obrigação e já está posta.

            O `dynamicTarget` vai a par da posição: sem ele o nível 1 reescreve
            o alvo no frame seguinte e eles voltam para dentro da área.
            */
            if (Area.contem(bolaFK.x, bolaFK.z, -attDir * LINHA_FUNDO) &&
                typeof lugaresDoInfratorNaArea === 'function') {
                const infratores = defendingPlayers.filter(
                    p => p.role !== 'gk' && !p.naBarreiraFalta);
                const homens = attackingPlayers.filter(
                    p => p.role !== 'gk' && p !== takerFK);
                lugaresDoInfratorNaArea(bolaFK.x, bolaFK.z, attDir, infratores, homens)
                    .forEach(l => {
                        l.p.model.position.set(l.x, ALTURA_BASE_Y, l.z);
                        l.p.dynamicTarget.set(l.x, ALTURA_BASE_Y, l.z);
                        l.p.setPieceTarget = new THREE.Vector3(l.x, ALTURA_BASE_Y, l.z);
                        l.p.velocity.set(0, 0, 0);
                        l.p.jostleAncora = null;
                        lookAtBola(l.p.model, bolaFK);
                        l.p.fsm.changeState('SET_PIECE_WAIT');
                    });
            }

            /*
            OS 9.15 m, DEPOIS DE TODA A GENTE COLOCADA.

            O afastamento existia, mas corria no meio do posicionamento — só
            sobre os defensores que sobram da barreira, e ANTES de os
            marcadores serem postos nos `slotsMarcacao`. Esses slots são
            medidos a partir da LINHA DE FUNDO e não sabem nada de onde está a
            bola: numa falta perto da área caem lá dentro dos 9.15 m.

            Medido numa falta a 20 m da baliza, distâncias dos dez defensores à
            bola depois do setup:

                2.35  7.37  9.16  9.16  9.24  9.24  10.81  13.28 ...
                 ^^^^  ^^^^ dois marcadores dentro da distância regulamentar

            Esta passagem é a última, e por isso é a que manda: empurra
            radialmente para fora quem estiver a menos de `afastaAdversarios`,
            barreira incluída (ela está a 9.15 e não é tocada). O guarda-redes
            fica de fora — a baliza dele pode estar a menos do que isso da bola,
            e não é ele que faz barreira.
            */
            defendingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                const dx = p.model.position.x - bolaFK.x;
                const dz = p.model.position.z - bolaFK.z;
                const d = Math.hypot(dx, dz);
                if (d >= F.afastaAdversarios) return;

                // Em cima da bola não há direcção nenhuma: empurra-se para a
                // própria baliza, que é o lado que um defensor recuaria.
                let ux, uz;
                if (d > 0.001) { ux = dx / d; uz = dz / d; }
                else { ux = 0; uz = -attDir; }

                p.model.position.x = THREE.MathUtils.clamp(
                    bolaFK.x + ux * F.afastaAdversarios, -(CAMPO_LARG / 2 - 1), CAMPO_LARG / 2 - 1);
                p.model.position.z = THREE.MathUtils.clamp(
                    bolaFK.z + uz * F.afastaAdversarios, -(CAMPO_COMP / 2 - 1), CAMPO_COMP / 2 - 1);
                lookAtBola(p.model, bolaFK);
            });

            /*
            LIMITAR ATACANTES À LINHA DE FORA-DE-JOGO
            Numa falta, a barreira e o limite de 9.15m podem empurrar a linha
            defensiva. Os atacantes (colocados por geometria absoluta) não podem
            ficar posicionados em fora-de-jogo.
            */
            let maxOppZ = (attDir === 1) ? -999 : 999;
            defendingPlayers.forEach(o => {
                if (o.role !== 'gk') {
                    if (attDir === 1 && o.model.position.z > maxOppZ) maxOppZ = o.model.position.z;
                    if (attDir === -1 && o.model.position.z < maxOppZ) maxOppZ = o.model.position.z;
                }
            });
            let limiteZ = (attDir === 1) 
                ? Math.max(0, maxOppZ, bolaFK.z) - 0.2
                : Math.min(0, maxOppZ, bolaFK.z) + 0.2;

            restantes.forEach(p => {
                const zAtk = p.model.position.z * attDir;
                const zLim = limiteZ * attDir;
                if (zAtk > zLim) {
                    p.model.position.z = limiteZ;
                    p.dynamicTarget.z = limiteZ;
                    p.setPieceTarget.z = limiteZ;
                    if (p.jostleAncora) p.jostleAncora.z = limiteZ;
                }
            });

            /*
            A COBRANÇA DO IMPEDIMENTO É A ÚLTIMA A FALAR.

            Tem de correr depois do `lugaresDaFalta` (que coloca os
            companheiros do batedor por sector), do afastamento dos 9.15 m e do
            corte pela linha de fora-de-jogo — senão qualquer um deles reescreve
            o recomeço por cima. Apanhado com a montagem a sair certa para quem
            marca e errada para quem bate: a chamada estava lá em cima, ao lado
            da `formaDaDefesaNoLivre`, e os `lugares` passavam-lhe por cima.
            */
            if (indirecta) this.formaDoLivreDeImpedimento(team, takerFK);

            this.faltaPendente = true;
            this.faltaAtraso = ESPERA_APOS_REPOSICAO;

        } else if (type === 'PENALTY') {
            /*
            PENÁLTI. Bola na marca, batedor atrás dela, guarda-redes na linha e
            toda a gente fora da área E fora da meia-lua. O remate tem resolução
            própria (ver executarPenalti) — os pesos do remate em jogo corrido
            não se aplicam a uma bola parada a 11 m sem oposição.
            */
            const PM = PenaltyModel;
            const linhaGolPen = attDir * (CAMPO_COMP / 2);
            const marcaZ = linhaGolPen - attDir * PM.marcaZ;

            this.ball.position.set(0, BallPhysics.raio, marcaZ);
            this.ballVel.set(0, 0, 0);
            this.players.concat(this.opponents).forEach(p => { p.hasBall = false; });
            this.ballCarrier = null;

            // Bate o melhor rematador da equipa.
            let takerPen = null, melhorTec = -1;
            attackingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                const t = p.skillFor('TEC');
                if (t > melhorTec) { melhorTec = t; takerPen = p; }
            });
            this.setPieceTaker = takerPen || null;

            if (takerPen) {
                takerPen.model.position.set(0, ALTURA_BASE_Y, marcaZ - attDir * PM.recuoBatedor);
                lookAtBola(takerPen.model, this.ball.position);
                takerPen.fsm.changeState('SET_PIECE_WAIT');
            }

            /*
            Os outros DEZANOVE (dois planteis menos os dois guarda-redes e o
            batedor) formam a fila da ENTRADA DA ÁREA, como nas imagens de
            referência: um aglomerado à entrada da área, com as duas equipas
            MESCLADAS, escalonado em profundidade por função, e sempre por FORA
            da meia-lua.

            A meia-lua é um círculo de 9.15 m centrado na MARCA, não uma faixa
            em z — a primeira versão testava `|x| < raio` e `|z - marca| < raio`,
            que é um quadrado, e deixava jogadores dentro do arco nas diagonais.
            Aqui o teste é o do círculo, e quem cai lá dentro é empurrado
            radialmente para fora a partir da marca.
            */
            const limiteZ = linhaGolPen - attDir * PM.margemArea;
            const filaZ = limiteZ - attDir * PM.folgaArea;   // um passo fora da área

            /*
            A fila é MESCLADA: as duas equipas intercaladas, como nas imagens de
            referência. Era `players.concat(opponents)`, ou seja o plantel todo
            de uma equipa e depois o da outra — e com a alternância a partir do
            eixo isso punha uma equipa ao centro e a outra nas pontas, cada uma
            no seu bloco. Ninguém disputa um ressalto assim.

            Dentro de cada equipa a ordem é a mesma do canto (`def → mid → ata`),
            e é ela que decide quem fica MAIS ATRÁS: os atacantes ficam à frente,
            a atacar o ressalto, e os defesas escalonados para trás, prontos para
            o contra-ataque. Ver defenseSetup no CORNER_KICK, que ordena assim
            pela mesma razão.
            */
            /*
            Dentro de cada equipa, as FUNÇÕES são intercaladas — ata, mid, def,
            ata, mid, def…

            Ao contrário do canto, onde a ordem `def → mid → ata` importa porque
            cada índice cai num SLOT diferente (poste, marcação, saída). Aqui os
            lugares são só posições ao longo do x, e o que a função decide é a
            PROFUNDIDADE. Ordenar por função — ou usar a ordem do plantel, que
            vem ordenada na mesma — punha os defesas todos num lado da fila e os
            atacantes no outro: segregava por posição depois de se ter resolvido
            a segregação por equipa.
            */
            /*
            COBERTURA: quem NÃO vai ao ressalto. Dois defesas e um médio de
            quem bate (a guardar as costas contra o contra-ataque) e dois
            atacantes de quem defende (à espera dele). Estes saem da fila e
            formam uma linha própria mais atrás e AO CENTRO — ver a colocação
            no fim deste ramo.

            Antes ficavam na fila com o x que lhes calhava e só recuavam: como
            a fila tem 21 lugares a 2.2 m, os que sobram estão nas pontas, e o
            que se via eram três jogadores encostados à linha lateral.
            */
            const cobertura = new Set();
            {
                const escolher = (lista, role, quantos) => lista
                    .filter(p => p !== takerPen && p.role === role &&
                        p.role !== 'gk' && !cobertura.has(p))
                    .slice(0, quantos)
                    .forEach(p => cobertura.add(p));
                escolher(attackingPlayers, 'def', PM.coberturaDef);
                escolher(attackingPlayers, 'mid', PM.coberturaMid);
                escolher(defendingPlayers, 'ata', PM.coberturaAtaAdv);
            }

            const naEntrada = lista => {
                const restantes = lista.filter(
                    p => p !== takerPen && p.role !== 'gk' && !cobertura.has(p));
                const filas = {
                    ata: restantes.filter(p => p.role === 'ata'),
                    mid: restantes.filter(p => p.role === 'mid'),
                    def: restantes.filter(p => p.role === 'def')
                };
                // Quem não tem uma das três funções vai para o meio.
                filas.mid = filas.mid.concat(
                    restantes.filter(p => !['ata', 'mid', 'def'].includes(p.role)));

                const ordem = ['ata', 'mid', 'def'];
                const saida = [];
                while (saida.length < restantes.length) {
                    let mexeu = false;
                    for (const r of ordem) {
                        if (filas[r].length) { saida.push(filas[r].shift()); mexeu = true; }
                    }
                    if (!mexeu) break;   // rede de segurança contra ciclo infinito
                }
                return saida;
            };

            /*
            A mescla é na ORDEM ESPACIAL, não na ordem da lista.

            Intercalar as listas (A, B, A, B…) e distribuir depois com a
            alternância a partir do eixo — `0, +1, -1, +2, -2…` — dá o resultado
            OPOSTO ao pretendido: os índices pares levam sempre passo positivo e
            os ímpares sempre negativo, portanto uma equipa fica toda à direita e
            a outra toda à esquerda. Perfeitamente segregadas, que é pior do que
            o bloco de origem.

            Por isso a fila é construída como posições ORDENADAS da esquerda para
            a direita, e as equipas alternam ao longo dessas posições.
            */
            const ladoA = naEntrada(this.players);
            const ladoB = naEntrada(this.opponents);
            const totalFila = ladoA.length + ladoB.length;

            const naFila = [];
            let iA = 0, iB = 0;
            for (let j = 0; j < totalFila; j++) {
                // Alterna; quando uma das equipas esgota, vai a outra.
                const querA = (j % 2 === 0);
                const p = (querA && iA < ladoA.length) ? ladoA[iA++]
                    : (iB < ladoB.length) ? ladoB[iB++]
                        : ladoA[iA++];
                naFila.push(p);
            }

            naFila.forEach((p, i) => {
                // Fila centrada no eixo, da esquerda para a direita.
                const centrado = i - (totalFila - 1) / 2;
                let x = centrado * PM.espacamentoFila;
                x = THREE.MathUtils.clamp(x, -(PM.areaX + 4.0), PM.areaX + 4.0);

                /*
                Escalonamento em profundidade por função: o defesa fica
                `recuoPorRole.def` metros mais atrás do que o atacante. Sem isto
                estavam todos na mesma linha, o que lê como uma parede e não como
                um aglomerado à espera do ressalto.
                */
                const recuo = (PM.recuoPorRole && PM.recuoPorRole[p.role] !== undefined)
                    ? PM.recuoPorRole[p.role] : 0.0;
                let z = filaZ - attDir * recuo;

                // Fora da meia-lua: círculo de raio 9.15 centrado na marca.
                const dx = x - 0, dz = z - marcaZ;
                const d = Math.hypot(dx, dz);
                const rMin = PM.raioMeiaLua + PM.folgaArco;
                if (d < rMin) {
                    const k = (d > 0.001) ? rMin / d : 1;
                    x = dx * k;
                    z = marcaZ + (d > 0.001 ? dz * k : -attDir * rMin);
                }

                p.model.position.set(x, ALTURA_BASE_Y, z);
                lookAtBola(p.model, this.ball.position);
                p.fsm.changeState('SET_PIECE_WAIT');
            });

            /*
            Linha da cobertura: `recuoCobertura` metros atrás da fila e
            CENTRADA no eixo do campo, com espaçamento próprio — é gente a
            cobrir o meio, não a fechar uma linha lateral.

            Mesclada como a fila: quem defende o ressalto (os dois atacantes
            adversários) alterna com quem o guarda, senão ficavam dois grupos
            colados. E os atacantes ficam `avancoAtaAdv` metros À FRENTE dos
            outros — estão à espera da bola, não a guardá-la.
            */
            const naCobertura = Array.from(cobertura);
            {
                const guardam = naCobertura.filter(p => attackingPlayers.includes(p));
                const esperam = naCobertura.filter(p => !attackingPlayers.includes(p));
                const mesclada = [];
                let iG = 0, iE = 0;
                while (mesclada.length < naCobertura.length) {
                    if (iG < guardam.length) mesclada.push(guardam[iG++]);
                    if (iE < esperam.length) mesclada.push(esperam[iE++]);
                    if (iG >= guardam.length && iE >= esperam.length) break;
                }

                const zCobertura = filaZ - attDir * PM.recuoCobertura;
                mesclada.forEach((p, i) => {
                    const centrado = i - (mesclada.length - 1) / 2;
                    const x = THREE.MathUtils.clamp(
                        centrado * PM.espacamentoCobertura,
                        -PM.limiteXCobertura, PM.limiteXCobertura);
                    const avanco = attackingPlayers.includes(p) ? 0 : PM.avancoAtaAdv;
                    p.model.position.set(x, ALTURA_BASE_Y, zCobertura + attDir * avanco);
                    lookAtBola(p.model, this.ball.position);
                    p.fsm.changeState('SET_PIECE_WAIT');
                });
            }

            // Guarda-redes que defende: SOBRE a linha de golo, pronto a reagir.
            const gkPen = defendingPlayers.find(p => p.role === 'gk');
            if (gkPen) {
                gkPen.model.position.set(0, ALTURA_BASE_Y, linhaGolPen);
                gkPen.gkEstado = 'idle';
                gkPen.gkReagiu = false;
                gkPen.gkDelayReacao = 0;
                gkPen.dive = null;
                lookAtBola(gkPen.model, this.ball.position);
                gkPen.resetBonesToDefault();
            }

            this.penaltiPendente = true;
            this.penaltiAtraso = ESPERA_APOS_REPOSICAO;

        } else if (type === 'GOAL_KICK') {
            /*
            Tiro de meta. `team` é quem BATE (a equipa que defende aquela
            baliza). A bola vai para a quina da pequena área do lado por onde
            saiu — `attDir` aqui é a direcção de ataque de quem bate, logo a
            baliza dele está em -attDir.
            */
            const G = GoalkeeperPose;
            const ladoX = Math.sign(this.ball.position.x) || 1;
            const linhaZ = -attDir * LINHA_FUNDO;            // linha de fundo dele
            const bolaX = ladoX * Area.pequenaMeiaLargura;
            const bolaZ = linhaZ + attDir * Area.pequenaProfundidade;       // para dentro do campo

            /*
            A bola NÃO teleporta já — continua o movimento que trazia até
            tocar no chão (`golKickAguardaChao`), só DEPOIS espera 3s
            (`golKickBolaAtraso`), e só então é puxada para a quina da
            pequena área e travada (ver o countdown em update() e o guard
            contra o clamp da linha de fundo em updateBall()). Os jogadores
            já reagem e se posicionam nesse meio tempo. Pedido explícito —
            antes ia instantaneamente.
            */
            this.golKickBolaAlvo = { x: bolaX, z: bolaZ };
            this.golKickAguardaChao = true;
            this.golKickBolaAtraso = 3.0;

            this.ballCarrier = null;
            this.golKickProntos = false;
            this.golKickEspera = 0;
            this.golKickAlvoEspera = 0; // Removida a espera (sem parada)
            this.golKickPendente = true;
            this.golKickAtrasoInicio = ESPERA_APOS_REPOSICAO;

            const gk = attackingPlayers.find(p => p.role === 'gk');
            this.setPieceTaker = gk || null;

            if (gk) {
                gk.hasBall = false;
                /*
                Fica quieto no ponto de arranque: o 'tiro_meta' (caminhada +
                corrida + chute) só começa ESPERA_APOS_REPOSICAO segundos
                depois de a bola assentar na quina da pequena área — ver
                golKickPendente no update().
                */
                gk.gkEstado = 'tiro_meta_espera';
                gk.gkTiroFase = 0;              // 0 = caminhar, 1 = corrida
                gk.gkTempoMergulho = 0;
                gk.gkKickAction = null;
                const recuo = G.tiroMetaRecuo || 3.8;
                // Posição de arranque atrás da bola à esquerda do alinhamento da bola
                gk.gkTiroAlvo = {
                    x: bolaX + gk.dirZ * 0.70,
                    z: bolaZ - gk.dirZ * recuo
                };
                // Posiciona o goleiro no ponto de partida do tiro de meta virado para a bola
                gk.model.position.set(gk.gkTiroAlvo.x, ALTURA_BASE_Y, gk.gkTiroAlvo.z);
                lookAtBola(gk.model, { x: bolaX, y: ALTURA_BASE_Y, z: bolaZ });
            }

            /*
            Os outros de quem bate: sobem um pouco para o meio-campo, como na
            construção normal quando o próprio guarda-redes tem a bola — não
            ficam encolhidos junto à própria área. Referência é o mesmo tecto
            "Linha Defensiva" do painel que baliza a equipa em jogo corrido
            (TeamShape.linhaDefensiva, aplicado à traseira do bloco em
            computeBlock, team_bt.js), só
            que aqui aplicado como avanço a partir da posição de formação
            (`baseTarget`), não como recuo a partir da bola.

            `MOVE_TO_POS` sobrevive ao ramo `esperarLance` do PlayerBT (ver
            player_bt.js) — sem essa excepção o BT reescrevia o estado para
            IDLE no frame seguinte e ninguém saía do sítio.
            */
            /*
            AS DUAS EQUIPAS À VOLTA DO MEIO-CAMPO — que é onde um tiro de meta
            se joga.

            O que se via (e o pedido: "um time deveria estar no meio campo e o
            time do batedor um pouco antes"): os 22 amontoados numa ponta.
            Medido com `tools/headless/tiro_de_meta.js`, a profundidade no
            referencial de ataque de quem bate — 0 é o meio-campo:

                equipa que bate     média -10.1   (do -29.7 ao +17.2)
                equipa que recebe   média +11.7   (do -17.9 ao +35.1)

            A equipa que RECEBE estava enfiada na PRÓPRIA área (+35 é o risco
            da grande área dela), a 60 m da bola, porque o `nivel2Activo()`
            deixava o nível 2 ligado no GOAL_KICK e o bloco dela é o bloco de
            quem NÃO tem a bola: ancorado à própria baliza. Um tiro de meta não
            é isso — quem recebe sobe ao meio-campo à espera da bola longa.

            Agora cada equipa é DISTRIBUÍDA numa faixa: a forma da formação
            (a ordem em profundidade e a largura em x) mantém-se, só se
            re-escala a profundidade para dentro da faixa. E o GOAL_KICK saiu
            do `nivel2Activo()`, senão o bloco reescrevia isto no frame
            seguinte.
            */
            this.formaDoTiroDeMeta(team, true);

            defendingPlayers.forEach(p => {
                if (p.role === 'gk') return;
                // Ninguém DENTRO da grande área de quem bate — é regra do lance.
                if (Area.contem(p.model.position.x, p.model.position.z, linhaZ)) {
                    p.model.position.z = linhaZ + attDir * (Area.profundidade + 1.0);
                }
            });
        }
    },

    triggerGoalKick: function (forceTeam = null) {
        let team = forceTeam;
        if (!team) {
            team = (this.ball && this.ball.position.z > 0) ? 'TeamB' : 'TeamA';
        }
        this.setupSetPiece('GOAL_KICK', team);
        if (this.golKickBolaAlvo) {
            this.ball.position.set(this.golKickBolaAlvo.x, BallPhysics.raio, this.golKickBolaAlvo.z);
            this.ballVel.set(0, 0, 0);
            this.golKickAguardaChao = false;
            this.golKickBolaAtraso = 0;
            this.golKickBolaAlvo = null;
        }
    },

    triggerFreeKick: function (forceTeam = null) {
        const team = forceTeam ||
            (this.ballCarrier ? this.ballCarrier.team : null) ||
            this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        this.setupSetPiece('FREE_KICK', team);
    },

    triggerDirectFreeKick: function (forceTeam = null) {
        const team = forceTeam ||
            (this.ballCarrier ? this.ballCarrier.team : null) ||
            this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        const attDir = (team === 'TeamA') ? 1 : -1;
        const golZ = attDir * (CAMPO_COMP / 2);

        // Distância de 17 a 23 metros da baliza
        const distBaliza = 17 + Math.random() * (23 - 17);
        // Posição Z correspondente
        const bolaZ = golZ - attDir * distBaliza;
        // Posição X de -10m a +10m do centro do gol
        const bolaX = (Math.random() * 20) - 10;

        if (this.ball) {
            this.ball.position.set(bolaX, BallPhysics.raio, bolaZ);
            this.ballVel.set(0, 0, 0);
        }

        this.setupSetPiece('FREE_KICK', team);
    },

    triggerPenalty: function (forceTeam = null) {
        const team = forceTeam ||
            (this.ballCarrier ? this.ballCarrier.team : null) ||
            this.possessionTeam || this.lastTouchedTeam || 'TeamA';
        this.setupSetPiece('PENALTY', team);
    },

    /*
    =========================================================================
    CARA A CARA — o avançado sozinho contra o guarda-redes
    =========================================================================
    Pedido: um botão que ponha o atacante a 25 m do CENTRO DA BALIZA, a 45
    graus, a correr para a baliza, para se ver a reacção dele e a do
    guarda-redes.

    O ÂNGULO É SORTEADO na faixa inteira, e não fixo nos 45 graus (pedido:
    "não é apenas a 45 graus; é de 45 de um lado até 45 do outro aleatório...
    ajusta para 30 para cada lado"). Portanto: um ângulo qualquer entre
    -`caraACaraAnguloMax` e +`caraACaraAnguloMax`, sempre a 25 m do CENTRO da
    baliza — o que muda é a direcção, não a distância.

    Um ângulo fixo mostrava um lance só. Com a faixa sorteada vê-se a série
    inteira de decisões: perto do eixo o remate é outro, a 30 graus o
    guarda-redes tapa outro canto, e o pé de apoio muda com o lado.

    Não é uma bola parada: o jogo fica em PLAY e ninguém apita. É uma
    MONTAGEM — põe-se o lance no sítio e deixa-se correr, que é o que um
    laboratório precisa.

    Todos os outros saem da jogada, menos os dois guarda-redes: com os
    companheiros por perto o avançado passa a bola, e com defesas atrás
    ninguém vê o duelo. Vão para o meio-campo do lado oposto, longe o
    suficiente para o `ShootingModel.frenteAFrente` (30 m de tecto) ainda
    reconhecer o lance como um frente-a-frente.
    */
    // Meia-abertura da faixa sorteada, em graus. 30 para cada lado do eixo.
    caraACaraAnguloMax: 30,
    caraACaraDistancia: 25,

    /*
    `forceAngulo` (em graus, positivo à direita do eixo) serve os testes e as
    ferramentas de medição: sem ele o ângulo é sorteado.
    */
    triggerCaraACara: function (forceTeam = null, forceAngulo = null) {
        const team = forceTeam || this.possessionTeam || 'TeamA';
        const atacantes = (team === 'TeamA') ? this.players : this.opponents;
        const defensores = (team === 'TeamA') ? this.opponents : this.players;
        if (!atacantes.length || !defensores.length) return;

        const maxG = this.caraACaraAnguloMax;
        const grausDoEixo = (typeof forceAngulo === 'number')
            ? forceAngulo
            : (Math.random() * 2 - 1) * maxG;
        const lado = (grausDoEixo >= 0) ? 1 : -1;

        /*
        O atacante: o avançado mais adiantado da formação. Sem avançado (uma
        formação sem `atk`), serve o que estiver mais à frente — o lance é
        sobre a posição e não sobre o posto.
        */
        const semGk = atacantes.filter(p => p.role !== 'gk');
        const atacante = semGk.find(p => p.role === 'atk') || semGk[semGk.length - 1];
        const gkDef = defensores.find(p => p.role === 'gk') || defensores[0];
        if (!atacante || !gkDef) return;

        this.mudarEstado('PLAY', 'cara_a_cara');
        this.setPieceTimer = 0;
        this.setPieceTaker = null;
        this.kickoffActive = false;
        this.kickoffTimer = 0;
        /*
        A bandeira da saída de bola mata-se aqui: sem isto o avançado chega
        aos 25 m da baliza adversária e o ramo `PasseSaidaDeBola` manda-o
        tocar para trás, porque a bandeira do pontapé de saída anterior ainda
        estava de pé. (O ramo passou também a exigir campo próprio — ver
        `precisaPassarAosDefesas` em bt/player_bt.js.)
        */
        this.kickoffPendingPassToDef = false;

        /*
        A GEOMETRIA. `dir` é o sentido de ataque, logo a baliza atacada está
        em `z = dir * CAMPO_COMP/2`. O avançado fica a `caraACaraDistancia` do
        CENTRO da baliza, num ângulo `grausDoEixo` medido a partir do eixo do
        campo: o x é o seno e a profundidade é o cosseno. A zero graus fica em
        frente à baliza, a 30 fica na diagonal — e a distância ao centro é
        sempre a mesma, que é o que torna os lances comparáveis.
        */
        const dir = atacante.dirZ;
        const fundoZ = dir * (CAMPO_COMP / 2);
        const rad = grausDoEixo * Math.PI / 180;
        const dist = this.caraACaraDistancia;
        const px = Math.sin(rad) * dist;
        const pz = fundoZ - dir * Math.cos(rad) * dist;

        atacante.model.position.set(px, ALTURA_BASE_Y, pz);
        atacante.velocity.set(0, 0, 0);
        atacante.dynamicTarget = new THREE.Vector3(0, ALTURA_BASE_Y, fundoZ);
        atacante.baseTarget.set(px, ALTURA_BASE_Y, pz);
        if (atacante.fsm) atacante.fsm.changeState('CARRY');
        atacante.touchLock = 0;
        atacante.hasBall = true;

        // De frente para a baliza, e a bola meio metro à frente do pé — é
        // isso que faz o lance começar em CORRIDA e não parado.
        if (typeof lookAtBola === 'function') {
            atacante.model.lookAt(0, atacante.model.position.y, fundoZ);
        }
        const rumo = new THREE.Vector3(-px, 0, fundoZ - pz).normalize();
        this.ball.position.set(px + rumo.x * 0.5, BallPhysics.raio, pz + rumo.z * 0.5);
        this.ballVel.set(0, 0, 0);

        this.ballCarrier = atacante;
        this.intendedReceiver = null;
        this.passTargetPos = null;
        this.possessionTeam = team;
        this.possessionTimer = 0;
        this.lastTouchedTeam = team;
        this.lastTouchedPlayer = atacante;
        window.bolaChutada = false;

        // O guarda-redes na linha, ao centro: a posição dele daí em diante é
        // do gkAnchor, e é justamente isso que se quer ver.
        const gkZ = dir * (CAMPO_COMP / 2) - dir * 0.5;
        gkDef.model.position.set(0, ALTURA_BASE_Y, gkZ);
        gkDef.velocity.set(0, 0, 0);
        if (gkDef.fsm) gkDef.fsm.changeState('IDLE');

        /*
        Todos os outros para o meio-campo de trás, em duas filas afastadas do
        corredor do lance. Escreve-se a posição E o alvo: sem o alvo, o nível 1
        trazia-os de volta à jogada em dois segundos.
        */
        let i = 0;
        for (const lista of [atacantes, defensores]) {
            const ladoFila = (lista === atacantes) ? -1 : 1;
            for (const p of lista) {
                if (p === atacante || p === gkDef || p.role === 'gk') continue;
                const fx = ladoFila * (CAMPO_LARG / 2 - 3);
                const fz = -dir * (10 + (i % 10) * 3.5);
                p.model.position.set(fx, ALTURA_BASE_Y, fz);
                p.velocity.set(0, 0, 0);
                p.dynamicTarget = new THREE.Vector3(fx, ALTURA_BASE_Y, fz);
                p.baseTarget.set(fx, ALTURA_BASE_Y, fz);
                p.hasBall = false;
                if (p.fsm) p.fsm.changeState('IDLE');
                i++;
            }
        }

        if (typeof Officials !== 'undefined' && Officials.anunciar) {
            Officials.anunciar('CARA A CARA ' + Math.round(grausDoEixo) + '°');
        }
        if (typeof EventBus !== 'undefined') {
            EventBus.emit('CARA_A_CARA', {
                p: atacante, gk: gkDef, lado: lado, graus: grausDoEixo
            });
        }
        return { atacante: atacante, gk: gkDef, lado: lado, graus: grausDoEixo };
    },

    triggerThrowIn: function (forceTeam = null) {
        const ultimo = this.lastTouchedTeam ||
            (this.ballCarrier ? this.ballCarrier.team : null) || 'TeamA';
        const team = forceTeam || (ultimo === 'TeamA' ? 'TeamB' : 'TeamA');
        this.setupSetPiece('THROW_IN', team);
    },

    triggerCornerKick: function (forceTeam = null) {
        let team = forceTeam;
        if (!team) {
            team = (this.ball && this.ball.position.z >= 0) ? 'TeamA' : 'TeamB';
        }
        this.setupSetPiece('CORNER_KICK', team);
    },

    /*
    A FORMA DO TIRO DE META — as duas equipas à volta do meio-campo.

    Era escrita em DOIS sítios com a mesma conta (`setupSetPiece` uma vez, e o
    `updateGoalKickWait` outra vez por frame). Mudar a do setup não mudava
    nada: a do frame seguinte mandava. Agora é esta função, chamada pelos dois.

    `mover` só é verdade na montagem — daí em diante actualiza-se o alvo de
    quem ainda vem a caminho, sem mexer no estado de quem já chegou.

    As faixas (GoalKickShape, config/player_behavior.js) estão no referencial
    de ATAQUE DE QUEM BATE; quem recebe usa-as com o sinal trocado, porque a
    distribuição trabalha no referencial de cada jogador.
    */
    /*
    A EQUIPA QUE DEFENDE UM LIVRE, arrumada num bloco à frente da bola.

    O `setupSetPiece` colocava a barreira e mais ninguém: os outros levavam um
    empurrão para fora dos 9.15 m e ficavam onde a jogada anterior os deixara.
    Com a falta longe da baliza a barreira é UM jogador, portanto nove ficavam
    ao acaso — e como o FREE_KICK está fora do `nivel2Activo()`, ninguém os
    vinha arrumar no frame seguinte. É o relato "uns de um lado do campo e
    outros do outro".

    A faixa é medida A PARTIR DA BOLA e na direcção em que ela vai ser batida
    (`dirFK`), e não da linha de fundo como no tiro de meta: quem defende um
    livre põe-se entre a bola e a própria baliza. Mantém-se a ORDEM EM
    PROFUNDIDADE da formação (o mais recuado continua o mais recuado) e o x de
    cada um, como no `formaDoTiroDeMeta` — é a mesma ideia, com outra origem.

    Quem está na barreira fica de fora: a posição dele já foi escrita, e é a
    Lei 13 que manda nela.
    */
    formaDaDefesaNoLivre: function (defensores, bolaFK, dirFK) {
        const S = (typeof FreeKickShape !== 'undefined') ? FreeKickShape
            : { de: 9.15, ate: 34.0 };
        const campo = defensores.filter(p =>
            p && p.role !== 'gk' && !p.naBarreiraFalta && p.model);
        if (!campo.length) return;

        /*
        A ordem em profundidade sai do `baseTarget` (o posto da formação), lido
        no referencial de ataque de cada um — é o mesmo critério do tiro de
        meta, e é o que impede que um central acabe à frente de um avançado.
        */
        const zs = campo.map(p => p.baseTarget.z * p.dirZ);
        const zMin = Math.min(...zs), zMax = Math.max(...zs);
        const span = (zMax - zMin) || 1;

        /*
        A FAIXA ENCOLHE QUANDO NÃO HÁ CAMPO.

        `ate` é medido a partir da bola, na direcção da baliza que eles
        defendem. Com o livre perto dessa baliza, os 34 m caem atrás da linha
        de fundo e o clamp encostava o bloco todo lá — o que, medido, atrasava
        o resto do lance: no tiro de meta seguinte a equipa ainda tinha 7.6 m
        para andar quando a bola foi batida.

        O fundo útil é a distância da bola à linha de fundo deles, menos
        `margemDaPropriaBaliza`, que é o espaço do guarda-redes. A faixa nunca
        fica mais curta do que `de`: a Lei 13 manda sempre.
        */
        const defDir = campo[0].dirZ;
        const distAteALinha = LINHA_FUNDO + bolaFK.z * defDir;
        const ate = Math.max(S.de + 1,
            Math.min(S.ate, distAteALinha - (S.margemDaPropriaBaliza || 8.0)));

        campo.forEach(p => {
            // v = 0 no mais recuado da formação, 1 no mais adiantado. O mais
            // adiantado é o que fica MAIS PERTO da bola.
            const v = ((p.baseTarget.z * p.dirZ) - zMin) / span;
            const avanco = ate - (ate - S.de) * v;

            const x = bolaFK.x + dirFK.x * avanco + p.baseTarget.x * 0.6;
            const z = bolaFK.z + dirFK.z * avanco;
            p.hasBall = false;
            p.velocity.set(0, 0, 0);
            p.model.position.set(
                THREE.MathUtils.clamp(x, -CAMPO_LARG / 2 + 1, CAMPO_LARG / 2 - 1),
                ALTURA_BASE_Y,
                THREE.MathUtils.clamp(z, -LINHA_FUNDO + 1, LINHA_FUNDO - 1));
            if (p.dynamicTarget) p.dynamicTarget.copy(p.model.position);
            lookAtBola(p.model, bolaFK);
            p.fsm.changeState('SET_PIECE_WAIT');
        });
    },

    /*
    A MONTAGEM DA COBRANÇA DO IMPEDIMENTO — as DUAS equipas.

    Ver OffsideRestartShape (config/player_behavior.js) para os números e para
    a medição que os motivou: em três de doze impedimentos reais as duas
    equipas ficavam a 52-56 m da bola, uma em cada metade do campo.

    Quem bate volta à forma no próprio campo, em três profundidades; quem marca
    recua para a própria metade. O batedor fica onde já o puseram — ao lado da
    bola — e o guarda-redes também não é tocado.

    As linhas saem do `role` da formação, não de um 4-4-2 escrito à mão.
    */
    formaDoLivreDeImpedimento: function (team, taker) {
        const S = (typeof OffsideRestartShape !== 'undefined') ? OffsideRestartShape : {
            linhaDefesa: 21.5, espacoParaOsMedios: 15.0, avancadosAlemDoMeio: 5.0,
            blocoAdversario: 30.0, largura: 1.0
        };
        const bate = (team === 'TeamA') ? this.players : this.opponents;
        const marca = (team === 'TeamA') ? this.opponents : this.players;

        const refBate = bate.find(p => p.role !== 'gk' && p.model);
        if (!refBate) return;
        const attDir = refBate.dirZ;

        const colocar = (p, xAtk, zAtk, dir) => {
            p.hasBall = false;
            p.velocity.set(0, 0, 0);
            p.model.position.set(
                THREE.MathUtils.clamp(xAtk, -CAMPO_LARG / 2 + 1, CAMPO_LARG / 2 - 1),
                ALTURA_BASE_Y,
                THREE.MathUtils.clamp(zAtk * dir, -LINHA_FUNDO + 1, LINHA_FUNDO - 1));
            if (p.dynamicTarget) p.dynamicTarget.copy(p.model.position);
            lookAtBola(p.model, this.ball.position);
            p.fsm.changeState('SET_PIECE_WAIT');
        };

        /*
        QUEM BATE: três profundidades, medidas no referencial de ataque dele.
        `linhaDefesa` conta da própria linha de fundo (por isso o −LINHA_FUNDO);
        os avançados contam do meio-campo, já do outro lado.
        */
        const zDefesa = -LINHA_FUNDO + S.linhaDefesa;
        const zMedios = zDefesa + S.espacoParaOsMedios;
        const zAvancados = S.avancadosAlemDoMeio;
        const porRole = { def: zDefesa, mid: zMedios, atk: zAvancados };

        for (const p of bate) {
            if (!p.model || p.role === 'gk' || p === taker) continue;
            const z = (porRole[p.role] !== undefined) ? porRole[p.role] : zMedios;
            colocar(p, p.baseTarget.x * S.largura, z, attDir);
        }

        /*
        QUEM MARCA: do meio-campo para trás, na própria metade — "marcando a
        partir da linha de meio-campo". Mantém a ordem em profundidade da
        formação dele, para os avançados ficarem à frente dos centrais.
        */
        const campoM = marca.filter(p => p && p.role !== 'gk' && p.model);
        if (!campoM.length) return;
        const zs = campoM.map(p => p.baseTarget.z * p.dirZ);
        const zMin = Math.min(...zs), zMax = Math.max(...zs);
        const span = (zMax - zMin) || 1;

        const frenteDeles = (S.avancoAlemDoMeio || 0);
        for (const p of campoM) {
            // v = 0 no mais recuado da formação, 1 no mais adiantado.
            const v = ((p.baseTarget.z * p.dirZ) - zMin) / span;
            const zAtkDeles = frenteDeles - S.blocoAdversario * (1 - v);
            colocar(p, p.baseTarget.x * S.largura, zAtkDeles, p.dirZ);
        }

        /*
        OS 9.15 m, DEPOIS DE TUDO. Esta montagem é a última a correr, portanto
        o afastamento que o ramo do livre faz mais acima já passou — e com o
        bloco a avançar para lá do meio-campo há fora-de-jogos perto da linha
        média em que alguém cairia dentro da distância regulamentar.
        */
        const minDist = (typeof FreeKickModel !== 'undefined' && FreeKickModel.afastaAdversarios)
            ? FreeKickModel.afastaAdversarios : 9.15;
        const bola = this.ball.position;
        for (const p of campoM) {
            const dx = p.model.position.x - bola.x;
            const dz = p.model.position.z - bola.z;
            const d = Math.hypot(dx, dz);
            if (d >= minDist) continue;
            // Em cima da bola não há direcção: empurra-se para a própria baliza.
            const ux = (d > 0.001) ? dx / d : 0;
            const uz = (d > 0.001) ? dz / d : -p.dirZ;
            p.model.position.x = THREE.MathUtils.clamp(
                bola.x + ux * minDist, -(CAMPO_LARG / 2 - 1), CAMPO_LARG / 2 - 1);
            p.model.position.z = THREE.MathUtils.clamp(
                bola.z + uz * minDist, -(LINHA_FUNDO - 1), LINHA_FUNDO - 1);
            if (p.dynamicTarget) p.dynamicTarget.copy(p.model.position);
            lookAtBola(p.model, bola);
        }
    },

    /*
    A FORMA DO TIRO DE META — três linhas de cada lado, e não uma escada.

    Ver GoalKickShape (config/player_behavior.js) para os números e para a
    medição que os motivou. `mover` distingue as duas chamadas: a do
    `setupSetPiece` manda toda a gente andar; a do `updateGoalKickWait`, que
    corre por frame enquanto o lance espera, só mexe em quem ainda vai a
    caminho — senão reescrevia o estado de quem já chegou.
    */
    formaDoTiroDeMeta: function (team, mover) {
        const S = (typeof GoalKickShape !== 'undefined') ? GoalKickShape : {
            linhaDefesa: 19.0, espacoParaOsMedios: 16.0, avancadosAlemDoMeio: 0.0,
            frenteDoBloco: 38.0, blocoAdversario: 26.0
        };
        const bate = (team === 'TeamA') ? this.players : this.opponents;
        const recebe = (team === 'TeamA') ? this.opponents : this.players;
        const attDir = (team === 'TeamA') ? 1 : -1;
        const linhaZ = -attDir * LINHA_FUNDO;      // linha de fundo de quem bate

        const escrever = (p, zAtkDeQuemBate) => {
            if (!mover && p.fsm.currentState !== 'MOVE_TO_POS') return;
            p.hasBall = false;
            p.dynamicTarget.set(p.baseTarget.x, ALTURA_BASE_Y, zAtkDeQuemBate * attDir);

            // Lei 16: ninguém do adversário dentro da grande área de quem bate.
            if (p.team !== team && Area.contem(p.dynamicTarget.x, p.dynamicTarget.z, linhaZ)) {
                p.dynamicTarget.z = linhaZ + attDir * (Area.profundidade + 1.0);
            }

            p.speedMult = 4.0;
            if (mover) p.fsm.changeState('MOVE_TO_POS');
            else if (p.model.position.distanceTo(p.dynamicTarget) < 1.5) {
                p.fsm.changeState('SET_PIECE_WAIT');
            }
        };

        /*
        QUEM BATE: as três linhas, medidas da própria linha de fundo. Os
        defesas à saída da área (é onde se recebe curto), os médios à frente
        deles, os avançados na linha do meio-campo.
        */
        const zDefesa = -LINHA_FUNDO + S.linhaDefesa;
        const porRole = {
            def: zDefesa,
            mid: zDefesa + S.espacoParaOsMedios,
            atk: S.avancadosAlemDoMeio
        };
        for (const p of bate) {
            if (p.role === 'gk' || !p.model) continue;
            const z = (porRole[p.role] !== undefined) ? porRole[p.role] : porRole.mid;
            escrever(p, z);
        }

        /*
        QUEM RECEBE: bloco com linha da frente própria, também medida da linha
        de fundo de quem bate. Mantém a ordem em profundidade da formação dele
        — os avançados à frente, a defesa atrás.
        */
        const campoR = recebe.filter(p => p.role !== 'gk' && p.model);
        if (campoR.length) {
            const zs = campoR.map(p => p.baseTarget.z * p.dirZ);
            const zMin = Math.min(...zs), zMax = Math.max(...zs);
            const span = (zMax - zMin) || 1;
            const frente = -LINHA_FUNDO + S.frenteDoBloco;
            for (const p of campoR) {
                // v = 1 no mais adiantado da formação dele, que é quem fica na
                // linha da frente do bloco.
                const v = ((p.baseTarget.z * p.dirZ) - zMin) / span;
                escrever(p, frente + S.blocoAdversario * (1 - v));
            }
        }
    },

    updateGoalKickWait: function (dt) {
        if (this.state !== 'GOAL_KICK') return;

        const team = this.setPieceTaker ? this.setPieceTaker.team : null;
        const atacantes = (team === 'TeamA') ? this.players : this.opponents;

        if (team) this.formaDoTiroDeMeta(team, false);

        if (!this.golKickProntos) {
            const todosProntos = atacantes.every(p => {
                if (p.role === 'gk') return true;
                return p.fsm.currentState === 'SET_PIECE_WAIT';
            });
            if (todosProntos) this.golKickProntos = true;
        } else {
            this.golKickEspera += dt;
        }
    },
});
