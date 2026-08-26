# PRD — Plataforma Innerworks de Monitoramento de Infraestrutura

**Nome provisório do produto:** Innerworks Monitor
**Versão do documento:** 1.0
**Status:** Planejamento
**Responsável:** Innerworks Soluções em Tecnologia
**Tipo de produto:** Plataforma SaaS de monitoramento de infraestrutura de TI
**Público inicial:** Equipe técnica da Innerworks e seus clientes empresariais

---

# 1. Visão geral

O Innerworks Monitor será uma plataforma de monitoramento de infraestrutura integrada ao portal de TI da Innerworks.

O sistema será responsável por monitorar:

* servidores físicos Windows e Linux;
* máquinas virtuais Windows Server e Linux;
* switches;
* roteadores;
* equipamentos MikroTik;
* impressoras;
* access points;
* antenas;
* nobreaks;
* sensores de temperatura;
* outros dispositivos compatíveis com protocolos de monitoramento.

A plataforma será composta por três elementos principais:

1. **Innerworks Server Agent**
   Instalado manualmente dentro de cada servidor físico ou máquina virtual Windows ou Linux.

2. **Innerworks Network Collector**
   Instalado manualmente em uma máquina dentro da rede do cliente para monitorar dispositivos que não permitem instalação de agente.

3. **Portal Innerworks**
   Interface central para cadastro, organização, visualização de métricas, histórico, alertas e gestão dos dispositivos.

O sistema não dependerá do endereço IP para identificar servidores e máquinas virtuais. Cada instalação receberá um identificador único e uma credencial própria.

---

# 2. Problema

A Innerworks utiliza atualmente o Zabbix para monitorar ambientes de clientes.

O cenário atual apresenta dificuldades como:

* quebra do monitoramento quando o endereço IP de um equipamento muda;
* configurações complexas;
* dificuldade de integração com o portal próprio;
* necessidade de manutenção frequente;
* dificuldade de organizar equipamentos por empresa, local e servidor físico;
* excesso de funcionalidades que não são necessárias para a operação inicial;
* experiência pouco amigável para clientes e gestores;
* dificuldade de transformar o monitoramento em um produto comercial próprio.

A proposta é substituir gradualmente a dependência do Zabbix por uma solução mais simples, controlada pela Innerworks e integrada diretamente ao seu portal.

---

# 3. Objetivo do produto

Criar uma plataforma de monitoramento de infraestrutura que permita à Innerworks:

* monitorar servidores e dispositivos de rede de seus clientes;
* evitar dependência de IP fixo para identificar servidores;
* visualizar toda a infraestrutura em um único portal;
* organizar equipamentos por empresa, local e estrutura;
* receber alertas de indisponibilidade e uso elevado;
* acompanhar histórico de métricas;
* monitorar servidores Windows e Linux de forma detalhada;
* monitorar dispositivos de rede utilizando um coletor local;
* transformar o monitoramento em um serviço comercial recorrente;
* oferecer maior transparência aos clientes;
* reduzir o tempo necessário para identificar falhas.

---

# 4. Escopo do produto

## 4.1 Incluído no escopo inicial

### Servidores físicos e máquinas virtuais

* instalação manual do agente;
* Windows Server;
* distribuições Linux compatíveis;
* identificação por agente;
* CPU;
* memória;
* armazenamento;
* leitura e gravação de disco;
* tráfego de rede;
* uptime;
* sistema operacional;
* hostname;
* endereços IP;
* versão do agente;
* status online e offline;
* associação com empresa;
* associação com local;
* associação opcional a um servidor físico;
* histórico de métricas;
* alertas básicos.

### Dispositivos de rede

* switches;
* roteadores;
* MikroTik;
* impressoras;
* access points;
* antenas;
* nobreaks;
* sensores;
* dispositivos compatíveis com SNMP;
* monitoramento por ICMP;
* monitoramento por SNMPv2c;
* monitoramento por SNMPv3;
* cadastro manual;
* descoberta controlada;
* disponibilidade;
* uptime;
* interfaces;
* tráfego;
* erros;
* temperatura, quando suportada;
* suprimentos de impressoras;
* contador de páginas;
* estado de portas;
* status de links.

### Portal

* empresas;
* locais;
* servidores físicos;
* máquinas virtuais;
* coletores;
* dispositivos de rede;
* alertas;
* histórico;
* permissões;
* dashboards;
* filtros;
* pesquisa;
* visualização por cliente.

---

## 4.2 Fora do escopo inicial

Não serão incluídos no primeiro MVP:

* acesso remoto ao servidor;
* execução remota de comandos;
* terminal PowerShell remoto;
* terminal SSH remoto;
* aplicação automática de correções;
* atualização automática do sistema operacional;
* substituição completa de ferramentas de RMM;
* gerenciamento de antivírus;
* gerenciamento de backup;
* análise avançada de logs;
* SIEM;
* mapa automático completo de topologia;
* cobrança automática por assinatura;
* aplicativo móvel nativo;
* execução de scripts nos clientes;
* controle remoto de switches ou roteadores.

Essas funcionalidades poderão ser avaliadas em versões futuras.

---

# 5. Usuários do sistema

## 5.1 Administrador Innerworks

Responsável por:

* cadastrar empresas;
* cadastrar locais;
* instalar e ativar agentes;
* cadastrar coletores;
* vincular dispositivos;
* configurar alertas;
* visualizar todos os clientes;
* gerenciar usuários;
* revogar agentes;
* arquivar equipamentos;
* acessar históricos;
* gerenciar planos futuramente.

## 5.2 Técnico Innerworks

Responsável por:

* acompanhar alertas;
* visualizar métricas;
* analisar falhas;
* cadastrar equipamentos;
* revisar dispositivos descobertos;
* adicionar observações;
* reconhecer alertas;
* acompanhar ambientes atribuídos.

## 5.3 Gestor do cliente

Responsável por:

* visualizar a infraestrutura de sua empresa;
* acompanhar disponibilidade;
* consultar alertas;
* visualizar relatórios;
* acompanhar indicadores gerais.

O gestor não poderá alterar configurações técnicas sensíveis.

## 5.4 Usuário observador

Responsável apenas por:

* visualizar dashboards;
* consultar status;
* acompanhar alertas autorizados.

---

# 6. Conceitos principais

## 6.1 Empresa

Representa o cliente atendido pela Innerworks.

Exemplo:

```text
Carpolog
EPA
Abrajeep
```

## 6.2 Local

Representa uma unidade, filial, escritório, datacenter ou ambiente.

Exemplo:

```text
Carpolog
├── Matriz
└── Filial Santos
```

## 6.3 Servidor físico

Equipamento físico que pode hospedar serviços ou máquinas virtuais.

Pode possuir o Innerworks Server Agent instalado.

## 6.4 Máquina virtual

Servidor virtual Windows ou Linux monitorado por um agente próprio.

A máquina virtual pode ser vinculada a um servidor físico, mas mantém uma identidade independente.

## 6.5 Agente

Programa instalado dentro de um servidor ou máquina virtual.

É responsável por:

* coletar informações locais;
* armazenar a configuração;
* autenticar-se;
* enviar métricas;
* enviar heartbeat;
* manter cache temporário;
* registrar logs.

## 6.6 Coletor

Programa instalado dentro da rede do cliente.

É responsável por consultar dispositivos que não permitem instalação de agente.

## 6.7 Dispositivo de rede

Equipamento monitorado pelo coletor.

Exemplos:

* switch;
* impressora;
* roteador;
* MikroTik;
* access point;
* nobreak;
* sensor.

## 6.8 Heartbeat

Mensagem periódica enviada pelo agente ou coletor para indicar que continua funcionando.

## 6.9 Métrica

Valor coletado em determinado momento.

Exemplos:

* CPU: 42%;
* memória: 76%;
* disco C: 81%;
* temperatura: 48 °C;
* toner: 12%.

## 6.10 Alerta

Evento gerado quando uma condição configurada é atingida.

---

# 7. Arquitetura geral

```text
┌──────────────────────────────────────────────────────┐
│ Rede do cliente                                     │
│                                                      │
│ Servidor físico ── Innerworks Server Agent           │
│ VM Windows ─────── Innerworks Server Agent           │
│ VM Linux ───────── Innerworks Server Agent           │
│                                                      │
│ Máquina coletora ── Innerworks Network Collector     │
│       │                                              │
│       ├── Switch                                     │
│       ├── Impressora                                 │
│       ├── MikroTik                                   │
│       ├── Access point                               │
│       └── Nobreak                                    │
└──────────────────────────┬───────────────────────────┘
                           │
                           │ HTTPS — porta 443
                           ▼
┌──────────────────────────────────────────────────────┐
│ API Innerworks Monitor                               │
│                                                      │
│ Autenticação                                         │
│ Recebimento de métricas                              │
│ Heartbeats                                           │
│ Alertas                                              │
│ Inventário                                           │
│ Gestão de agentes                                    │
└──────────────────────────┬───────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────┐
│ Banco de dados                                       │
│                                                      │
│ Empresas                                             │
│ Locais                                               │
│ Agentes                                              │
│ Coletores                                            │
│ Dispositivos                                         │
│ Métricas                                             │
│ Alertas                                              │
│ Histórico                                            │
└──────────────────────────┬───────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────┐
│ Portal Innerworks                                    │
│                                                      │
│ Dashboard                                            │
│ Empresas                                             │
│ Infraestrutura                                       │
│ Alertas                                              │
│ Histórico                                            │
│ Configurações                                        │
└──────────────────────────────────────────────────────┘
```

---

# 8. Innerworks Server Agent

## 8.1 Objetivo

Monitorar de forma detalhada a máquina na qual está instalado.

O agente deverá funcionar em:

* Windows Server;
* Windows 10 ou 11, futuramente;
* distribuições Linux suportadas.

O agente será desenvolvido preferencialmente em Rust.

---

## 8.2 Instalação manual

A instalação será realizada manualmente em cada servidor físico ou máquina virtual.

Não haverá instalação por GPO no escopo inicial.

### Windows

O instalador deverá:

1. executar como administrador;
2. apresentar os termos e informações básicas;
3. instalar os arquivos;
4. registrar um serviço do Windows;
5. configurar inicialização automática;
6. iniciar o agente;
7. solicitar um código de ativação;
8. exibir o código ao instalador;
9. aguardar o vínculo no portal;
10. confirmar a ativação.

Exemplo:

```text
Innerworks Monitor Agent

Status: aguardando ativação

Código:
IW-7F4K-92QP

Acesse o Portal Innerworks e informe este código.
Validade: 15 minutos.
```

### Linux

O instalador deverá:

1. ser executado com privilégios administrativos;
2. copiar o binário;
3. criar diretórios de configuração;
4. criar serviço systemd;
5. iniciar automaticamente;
6. solicitar código de ativação;
7. aguardar o vínculo;
8. confirmar a ativação.

Exemplo:

```bash
sudo ./innerworks-agent install
```

---

## 8.3 Processo de ativação

O agente não será vinculado automaticamente a uma empresa.

O processo será:

1. agente inicia;
2. agente solicita um código temporário;
3. portal gera o código;
4. agente exibe o código;
5. técnico acessa o portal;
6. técnico informa o código;
7. técnico seleciona empresa;
8. técnico seleciona local;
9. técnico define o tipo do equipamento;
10. técnico associa opcionalmente a um servidor físico;
11. portal ativa o agente;
12. agente recebe uma credencial permanente.

---

## 8.4 Dados de cadastro

Durante a ativação, o técnico deverá informar:

* empresa;
* local;
* nome amigável;
* tipo do equipamento;
* servidor físico associado, quando for VM;
* criticidade;
* ambiente;
* responsável;
* observações.

### Tipos de equipamento

* servidor físico;
* hypervisor;
* máquina virtual;
* servidor dedicado;
* estação, futuramente.

### Ambiente

* produção;
* homologação;
* desenvolvimento;
* teste;
* temporário.

### Criticidade

* baixa;
* média;
* alta;
* crítica.

---

## 8.5 Identidade do agente

Cada agente deverá possuir:

```text
agent_id
agent_token
installation_id
hostname
device_fingerprint
```

O endereço IP não será utilizado como identidade principal.

Mudanças de IP não deverão criar um novo dispositivo.

---

## 8.6 Métricas obrigatórias do MVP

### Sistema

* hostname;
* nome do sistema operacional;
* versão do sistema operacional;
* arquitetura;
* kernel;
* data e hora local;
* uptime;
* último boot;
* versão do agente.

### CPU

* uso total;
* quantidade de núcleos físicos;
* quantidade de núcleos lógicos;
* frequência, quando disponível;
* carga média no Linux;
* uso por intervalo.

### Memória

* memória total;
* memória utilizada;
* memória disponível;
* percentual utilizado;
* swap ou pagefile;
* percentual de swap ou pagefile.

### Armazenamento

Para cada partição:

* nome;
* ponto de montagem;
* sistema de arquivos;
* capacidade total;
* espaço utilizado;
* espaço livre;
* percentual utilizado.

### Disco

Para cada disco:

* leitura por segundo;
* gravação por segundo;
* total lido;
* total gravado;
* tempo de atividade, quando disponível;
* fila de disco, futuramente;
* latência, futuramente.

### Rede

Para cada interface:

* nome;
* endereço MAC;
* endereços IP;
* velocidade;
* estado;
* dados recebidos;
* dados enviados;
* download por segundo;
* upload por segundo;
* erros, quando disponíveis.

---

## 8.7 Métricas futuras

* processos;
* serviços do Windows;
* serviços systemd;
* eventos do Windows;
* logs Linux;
* atualizações pendentes;
* antivírus;
* backup;
* bancos de dados;
* IIS;
* Apache;
* Nginx;
* Docker;
* containers;
* portas TCP;
* certificados;
* tarefas agendadas;
* usuários conectados;
* inventário de software.

---

## 8.8 Periodicidade

Configuração inicial:

| Informação              |   Intervalo |
| ----------------------- | ----------: |
| Heartbeat               | 30 segundos |
| CPU                     | 60 segundos |
| Memória                 | 60 segundos |
| Disco                   | 60 segundos |
| Rede                    | 60 segundos |
| Inventário do sistema   |     6 horas |
| Informações de hardware |    24 horas |

Os intervalos deverão ser configuráveis no portal em versões futuras.

---

## 8.9 Cache local

Quando não houver conexão com a internet, o agente deverá:

1. continuar coletando métricas;
2. salvar temporariamente os dados localmente;
3. tentar reconectar;
4. reenviar os dados pendentes;
5. respeitar um limite de armazenamento.

Limite inicial sugerido:

* até 24 horas de métricas; ou
* até 50 MB por agente.

Ao atingir o limite, as métricas mais antigas serão removidas primeiro.

---

## 8.10 Logs do agente

O agente deverá registrar:

* início e parada;
* ativação;
* erros de comunicação;
* falhas de coleta;
* alterações de configuração;
* atualização;
* perda e retorno de conexão.

Os logs não poderão conter:

* tokens completos;
* senhas;
* credenciais;
* dados confidenciais desnecessários.

---

# 9. Associação entre máquinas virtuais e servidores físicos

## 9.1 Estrutura

O portal deverá permitir:

```text
Empresa
└── Local
    └── Servidor físico
        ├── VM 01
        ├── VM 02
        └── VM 03
```

## 9.2 Regras

* cada VM possui identidade independente;
* uma VM pode estar associada a um servidor físico;
* o vínculo pode ser alterado;
* o histórico da VM permanece mesmo após migração;
* a exclusão do servidor físico não exclui automaticamente as VMs;
* uma VM pode existir sem servidor físico associado;
* o mesmo agente não pode estar associado a dois equipamentos ao mesmo tempo.

## 9.3 Migração

Quando uma VM for migrada:

```text
Servidor anterior: HOST-HYPERV-01
Servidor atual: HOST-HYPERV-02
```

O portal deverá manter:

* histórico;
* métricas;
* alertas;
* nome;
* identidade;
* observações.

Somente a associação com o servidor físico será alterada.

---

# 10. Innerworks Network Collector

## 10.1 Objetivo

Monitorar equipamentos nos quais não é possível instalar um agente.

O coletor será instalado em uma máquina que permaneça ligada dentro da rede do cliente.

---

## 10.2 Instalação manual

A instalação do coletor será manual.

O processo será semelhante ao do agente:

1. instalar o coletor;
2. registrar como serviço;
3. iniciar automaticamente;
4. gerar código de ativação;
5. vincular à empresa;
6. vincular ao local;
7. definir as redes autorizadas;
8. configurar credenciais de monitoramento.

---

## 10.3 Requisitos do coletor

O coletor deverá:

* funcionar em Windows e Linux;
* iniciar automaticamente;
* utilizar HTTPS para comunicação;
* aceitar cadastro de redes autorizadas;
* consultar dispositivos por IP;
* enviar heartbeat;
* armazenar cache temporário;
* possuir logs;
* identificar falhas de comunicação;
* diferenciar dispositivo offline de coletor offline.

---

## 10.4 Protocolos suportados no MVP

* ICMP;
* ARP local;
* SNMPv2c;
* SNMPv3;
* HTTP ou HTTPS para verificações simples;
* IPP para impressoras, quando aplicável.

Protocolos futuros:

* LLDP;
* API MikroTik;
* API UniFi;
* SSH somente leitura;
* WMI remoto;
* traps SNMP;
* APIs específicas de fabricantes.

---

## 10.5 Cadastro de dispositivos

O dispositivo poderá ser cadastrado de duas formas.

### Cadastro manual

O técnico informa:

* IP;
* tipo;
* nome;
* fabricante;
* modelo;
* protocolo;
* credencial;
* coletor;
* empresa;
* local.

### Descoberta

O técnico informa uma rede autorizada:

```text
192.168.20.0/24
```

O coletor verifica:

* resposta ICMP;
* tabela ARP;
* SNMP;
* portas permitidas;
* informações básicas.

O portal apresenta os dispositivos encontrados para aprovação.

---

## 10.6 Identidade dos dispositivos

O dispositivo deverá ser identificado por uma combinação de:

* MAC address;
* número de série;
* SNMP Engine ID;
* fabricante;
* modelo;
* hostname;
* identificador do fabricante.

O IP será tratado como endereço atual, não como identidade permanente.

---

# 11. Monitoramento de switches

## 11.1 Métricas

* disponibilidade;
* uptime;
* CPU, quando suportada;
* memória, quando suportada;
* temperatura;
* estado das portas;
* velocidade das portas;
* tráfego por interface;
* erros de entrada;
* erros de saída;
* pacotes descartados;
* estado administrativo;
* estado operacional;
* consumo PoE, futuramente;
* LLDP, futuramente;
* VLANs, futuramente.

## 11.2 Alertas

* switch offline;
* porta crítica offline;
* porta negociando abaixo da velocidade esperada;
* erros acima do limite;
* temperatura elevada;
* consumo PoE elevado;
* reinicialização detectada.

---

# 12. Monitoramento de impressoras

## 12.1 Métricas

* disponibilidade;
* status;
* modelo;
* fabricante;
* número de série;
* hostname;
* IP;
* contador total de páginas;
* toner;
* cilindro, quando suportado;
* bandejas;
* papel;
* erros;
* atolamento;
* tampa aberta;
* falta de suprimento.

## 12.2 Alertas

* impressora offline;
* toner abaixo de 15%;
* toner abaixo de 5%;
* papel atolado;
* bandeja vazia;
* erro de impressão;
* manutenção necessária;
* contador de páginas acima do limite.

---

# 13. Monitoramento de MikroTik

## 13.1 MVP por SNMP

* disponibilidade;
* uptime;
* CPU;
* memória;
* armazenamento;
* temperatura;
* tensão, quando disponível;
* interfaces;
* tráfego;
* erros;
* estado dos links.

## 13.2 Versão futura por API

* PPPoE;
* rotas;
* gateways;
* DHCP leases;
* VPNs;
* filas;
* Netwatch;
* tabelas de roteamento;
* logs selecionados;
* estado de failover.

As credenciais da API deverão ser de somente leitura.

---

# 14. Monitoramento de access points e antenas

## 14.1 Métricas

* disponibilidade;
* uptime;
* CPU;
* memória;
* tráfego;
* clientes conectados;
* canal;
* frequência;
* qualidade do sinal;
* ruído;
* temperatura;
* firmware;
* estado do link.

## 14.2 Integrações futuras

* UniFi Controller;
* UISP;
* Omada Controller;
* controladoras específicas.

---

# 15. Monitoramento de nobreaks e sensores

## 15.1 Nobreaks

* disponibilidade;
* tensão de entrada;
* tensão de saída;
* carga;
* estado da bateria;
* autonomia;
* temperatura;
* operação em bateria;
* falha elétrica;
* necessidade de troca de bateria.

## 15.2 Sensores

* temperatura;
* umidade;
* fumaça;
* água;
* abertura de porta;
* energia;
* alarmes específicos.

---

# 16. Status dos agentes e dispositivos

## 16.1 Agente

| Status     | Regra inicial                                |
| ---------- | -------------------------------------------- |
| Online     | último contato inferior a 90 segundos        |
| Instável   | último contato entre 90 segundos e 3 minutos |
| Offline    | último contato superior a 3 minutos          |
| Desativado | agente revogado                              |
| Arquivado  | removido da operação ativa                   |

## 16.2 Coletor

Mesmas regras do agente.

## 16.3 Dispositivo de rede

| Status       | Significado                               |
| ------------ | ----------------------------------------- |
| Online       | coletor conseguiu consultar               |
| Atenção      | respondeu, mas possui alerta              |
| Offline      | coletor online, dispositivo não respondeu |
| Desconhecido | coletor está offline                      |
| Ignorado     | monitoramento desativado                  |
| Arquivado    | removido da operação ativa                |

Quando o coletor estiver offline, os dispositivos dependentes não deverão ser marcados como offline.

Eles deverão aparecer como:

```text
Estado desconhecido — coletor indisponível
```

---

# 17. Sistema de alertas

## 17.1 Tipos de alerta

### Disponibilidade

* agente offline;
* coletor offline;
* dispositivo offline;
* serviço indisponível, futuramente.

### Desempenho

* CPU elevada;
* memória elevada;
* disco cheio;
* leitura ou gravação elevada;
* tráfego elevado;
* temperatura elevada.

### Infraestrutura

* porta de switch offline;
* erros de interface;
* link MikroTik offline;
* impressora sem toner;
* nobreak em bateria;
* sensor com temperatura elevada.

---

## 17.2 Severidade

* informação;
* baixa;
* média;
* alta;
* crítica.

## 17.3 Estados do alerta

* aberto;
* reconhecido;
* em análise;
* resolvido;
* ignorado.

## 17.4 Regras iniciais sugeridas

| Métrica     |                     Atenção |                    Crítico |
| ----------- | --------------------------: | -------------------------: |
| CPU         | acima de 80% por 10 minutos | acima de 95% por 5 minutos |
| Memória     | acima de 85% por 10 minutos | acima de 95% por 5 minutos |
| Disco       |                acima de 80% |               acima de 90% |
| Toner       |               abaixo de 15% |               abaixo de 5% |
| Temperatura |                configurável |               configurável |
| Offline     |                   3 minutos |                 10 minutos |

Os limites deverão ser configuráveis por dispositivo.

---

## 17.5 Evitar alertas repetidos

O sistema deverá evitar envio contínuo do mesmo alerta.

Regras:

* um único alerta aberto por condição;
* atualização do alerta existente;
* envio de recuperação quando normalizar;
* intervalo mínimo entre notificações;
* possibilidade de silenciar;
* janela de manutenção.

---

# 18. Notificações

## 18.1 MVP

* alerta dentro do portal;
* e-mail;
* registro no histórico.

## 18.2 Futuro

* Microsoft Teams;
* WhatsApp;
* Telegram;
* webhook;
* GLPI;
* criação automática de chamado;
* SMS.

---

# 19. Portal Innerworks

## 19.1 Dashboard geral

O dashboard deverá mostrar:

* total de empresas;
* total de dispositivos;
* agentes online;
* agentes offline;
* coletores online;
* coletores offline;
* dispositivos com alerta;
* alertas críticos;
* disponibilidade geral;
* servidores com maior uso de CPU;
* servidores com maior uso de memória;
* discos próximos do limite;
* últimos eventos.

---

## 19.2 Tela de empresas

Cada empresa deverá apresentar:

* nome;
* quantidade de locais;
* servidores;
* VMs;
* dispositivos de rede;
* coletores;
* alertas;
* disponibilidade.

---

## 19.3 Tela do local

Exemplo:

```text
Carpolog — Matriz

Servidores físicos
├── HOST-HYPERV-01
└── HOST-BACKUP-01

Máquinas virtuais
├── SRV-AD01
├── SRV-ARQUIVOS
└── SRV-ERP

Rede
├── MikroTik
├── Switch principal
├── Access points
└── Impressoras
```

---

## 19.4 Tela do servidor físico

Deverá mostrar:

* nome;
* status;
* sistema;
* uptime;
* CPU;
* memória;
* armazenamento;
* interfaces;
* alertas;
* histórico;
* máquinas virtuais associadas;
* informações do agente.

---

## 19.5 Tela da máquina virtual

Deverá mostrar:

* nome;
* empresa;
* local;
* servidor físico;
* status;
* sistema operacional;
* hostname;
* IP;
* CPU;
* memória;
* partições;
* discos;
* rede;
* uptime;
* alertas;
* histórico;
* versão do agente.

---

## 19.6 Tela do dispositivo de rede

Deverá variar conforme o tipo.

### Switch

* portas;
* tráfego;
* erros;
* temperatura;
* uptime.

### Impressora

* toner;
* contador;
* status;
* erros.

### MikroTik

* interfaces;
* CPU;
* memória;
* links;
* temperatura.

---

## 19.7 Tela de alertas

Filtros:

* empresa;
* local;
* dispositivo;
* severidade;
* status;
* período;
* responsável.

Ações:

* reconhecer;
* atribuir;
* adicionar comentário;
* resolver;
* silenciar;
* abrir chamado futuramente.

---

## 19.8 Tela de ativação

Campos:

```text
Código de ativação
Empresa
Local
Tipo de equipamento
Nome amigável
Servidor físico associado
Ambiente
Criticidade
Observações
```

---

# 20. Modelo de dados inicial

## 20.1 Companies

```text
id
name
document
status
created_at
updated_at
```

## 20.2 Sites

```text
id
company_id
name
description
timezone
status
created_at
updated_at
```

## 20.3 Devices

Tabela principal para equipamentos.

```text
id
company_id
site_id
parent_device_id
collector_id
device_type
name
hostname
manufacturer
model
serial_number
mac_address
current_ip
operating_system
environment
criticality
status
last_seen_at
created_at
updated_at
archived_at
```

## 20.4 Agents

```text
id
device_id
installation_id
token_hash
version
status
last_seen_at
activated_at
revoked_at
created_at
updated_at
```

## 20.5 Agent enrollments

```text
id
code_hash
installation_id
status
expires_at
claimed_by
device_id
created_at
used_at
```

## 20.6 Collectors

```text
id
device_id
token_hash
version
status
last_seen_at
created_at
updated_at
revoked_at
```

## 20.7 Metrics

```text
id
device_id
metric_type
metric_name
value
unit
collected_at
received_at
metadata
```

Para maior escala, métricas poderão ser separadas por categoria.

## 20.8 Partitions

```text
id
device_id
identifier
mount_point
filesystem
total_bytes
used_bytes
free_bytes
last_seen_at
```

## 20.9 Network interfaces

```text
id
device_id
interface_index
name
description
mac_address
speed_bps
administrative_status
operational_status
last_seen_at
```

## 20.10 Alerts

```text
id
company_id
site_id
device_id
rule_id
severity
status
title
description
opened_at
acknowledged_at
resolved_at
assigned_to
```

## 20.11 Alert rules

```text
id
company_id
device_id
metric_name
operator
threshold
duration_seconds
severity
is_enabled
created_at
updated_at
```

---

# 21. API inicial

## 21.1 Ativação

```http
POST /api/v1/enrollments/request
GET  /api/v1/enrollments/{code}/status
POST /api/v1/enrollments/{code}/claim
POST /api/v1/agents/activate
```

## 21.2 Agentes

```http
POST /api/v1/agents/heartbeat
POST /api/v1/agents/metrics
POST /api/v1/agents/inventory
GET  /api/v1/agents/config
POST /api/v1/agents/logs
```

## 21.3 Coletores

```http
POST /api/v1/collectors/heartbeat
POST /api/v1/collectors/devices
POST /api/v1/collectors/metrics
POST /api/v1/collectors/discovery
GET  /api/v1/collectors/config
```

## 21.4 Portal

```http
GET    /api/v1/companies
POST   /api/v1/companies
GET    /api/v1/sites
POST   /api/v1/sites
GET    /api/v1/devices
GET    /api/v1/devices/{id}
PATCH  /api/v1/devices/{id}
POST   /api/v1/devices/{id}/archive
POST   /api/v1/devices/{id}/revoke
GET    /api/v1/alerts
POST   /api/v1/alerts/{id}/acknowledge
POST   /api/v1/alerts/{id}/resolve
```

---

# 22. Segurança

## 22.1 Comunicação

* HTTPS obrigatório;
* TLS moderno;
* porta 443;
* validação do certificado;
* nenhuma comunicação sem criptografia.

## 22.2 Ativação

* código temporário;
* validade máxima de 15 minutos;
* uso único;
* limite de tentativas;
* código armazenado em hash;
* invalidação após uso.

## 22.3 Credenciais

* token exclusivo por agente;
* token exclusivo por coletor;
* armazenamento em hash no servidor;
* possibilidade de revogação;
* rotação futura;
* nunca exibir token completo no portal.

## 22.4 SNMP

Preferência:

1. SNMPv3;
2. SNMPv2c para equipamentos legados;
3. SNMPv1 apenas quando inevitável.

As credenciais deverão:

* ser somente leitura;
* ficar criptografadas;
* ser acessíveis apenas pelo coletor autorizado;
* não aparecer em logs.

## 22.5 Permissões

O sistema deverá utilizar controle de acesso por função.

Perfis:

* administrador;
* técnico;
* gestor do cliente;
* observador.

## 22.6 Auditoria

Registrar:

* login;
* ativação;
* revogação;
* alteração de empresa;
* alteração de local;
* mudança de servidor associado;
* alteração de regra;
* reconhecimento de alerta;
* exclusão ou arquivamento.

---

# 23. Requisitos não funcionais

## 23.1 Desempenho

* recebimento de métricas sem travar o portal;
* processamento assíncrono;
* consultas recentes rápidas;
* carregamento inicial de dashboard inferior a 3 segundos em condições normais.

## 23.2 Escalabilidade

A arquitetura deverá suportar inicialmente:

* 100 empresas;
* 1.000 agentes;
* 100 coletores;
* 5.000 dispositivos;
* milhões de registros de métricas.

## 23.3 Disponibilidade

Meta inicial:

* disponibilidade mensal da API acima de 99,5%;
* tolerância a perda temporária de comunicação;
* reenvio de métricas em cache.

## 23.4 Compatibilidade

### Windows

Primeira fase:

* Windows Server 2016;
* Windows Server 2019;
* Windows Server 2022;
* Windows Server 2025.

### Linux

Primeira fase:

* Debian;
* Ubuntu Server;
* Rocky Linux;
* AlmaLinux.

## 23.5 Consumo do agente

Meta:

* memória inferior a 100 MB;
* CPU média inferior a 1%;
* baixo impacto em disco;
* coleta não bloqueante.

## 23.6 Consumo do coletor

Dependerá da quantidade de dispositivos.

Meta inicial:

* até 500 dispositivos por coletor;
* consultas controladas;
* limite de concorrência;
* prevenção de sobrecarga da rede.

---

# 24. Retenção de dados

Sugestão inicial:

| Tipo                        |                       Retenção |
| --------------------------- | -----------------------------: |
| Métricas detalhadas         |                        30 dias |
| Métricas agregadas por hora |                       12 meses |
| Alertas                     |                       24 meses |
| Auditoria                   |                       24 meses |
| Inventário                  | enquanto o dispositivo existir |
| Logs técnicos               |                        30 dias |

A retenção poderá variar conforme o plano comercial.

---

# 25. Agregação de métricas

Para reduzir o volume:

* dados brutos por minuto;
* média de 5 minutos;
* média por hora;
* mínimo;
* máximo;
* percentil, futuramente.

Exemplo:

```text
Primeiros 30 dias:
dados por minuto

Após 30 dias:
dados agregados por hora
```

---

# 26. Atualização dos componentes

## 26.1 MVP

A atualização do agente e do coletor será manual.

O portal deverá informar:

```text
Versão instalada: 0.1.0
Versão disponível: 0.2.0
Status: atualização recomendada
```

## 26.2 Futuro

* atualização automática;
* pacotes assinados;
* canal estável;
* canal beta;
* rollback;
* atualização em grupos.

---

# 27. Desinstalação

O processo deverá:

* parar o serviço;
* remover o serviço;
* remover binários;
* preservar logs apenas quando solicitado;
* revogar a instalação pelo portal;
* não excluir automaticamente o histórico.

---

# 28. Tratamento de remoção de equipamentos

Um equipamento não deverá ser excluído automaticamente.

Fluxo:

```text
Sem contato por 3 minutos:
Offline

Sem contato por 7 dias:
Ausente

Arquivamento:
Manual
```

Ao arquivar:

* métricas históricas permanecem;
* alertas permanecem;
* dispositivo sai das telas principais;
* dispositivo pode ser restaurado.

---

# 29. Experiência de instalação

A instalação manual deve ser simples.

Meta:

* instalação em até cinco etapas;
* nenhum arquivo de configuração manual;
* nenhuma edição de JSON;
* nenhuma abertura de portas de entrada;
* apenas saída HTTPS;
* ativação por código;
* confirmação visual.

### Fluxo esperado

```text
1. Baixar instalador
2. Executar como administrador
3. Instalar serviço
4. Copiar código
5. Vincular no portal
```

---

# 30. Roadmap

## Fase 1 — Prova de conceito

* agente Rust;
* Windows Server;
* CPU;
* memória;
* disco;
* rede;
* heartbeat;
* API;
* cadastro simples;
* dashboard básico.

## Fase 2 — MVP interno

* agente Windows;
* agente Linux;
* instalação manual;
* ativação por código;
* empresas;
* locais;
* servidores físicos;
* VMs;
* associação entre VM e host;
* histórico de 24 horas;
* status online e offline;
* alertas básicos.

## Fase 3 — Coletor de rede

* coletor Windows e Linux;
* cadastro manual;
* ICMP;
* SNMPv2c;
* SNMPv3;
* switches;
* impressoras;
* MikroTik;
* dispositivos online e offline.

## Fase 4 — Operação comercial

* dashboards por cliente;
* e-mail;
* retenção;
* perfis de acesso;
* auditoria;
* relatórios;
* políticas de criticidade;
* filtros;
* exportações.

## Fase 5 — Expansão

* API MikroTik;
* UniFi;
* nobreaks;
* sensores;
* serviços Windows;
* systemd;
* aplicações;
* banco de dados;
* certificados;
* integração GLPI;
* Teams;
* WhatsApp;
* planos comerciais.

---

# 31. MVP recomendado

O primeiro MVP deverá conter somente o necessário para validar o produto.

## Agente

* Windows Server;
* Linux;
* instalação manual;
* serviço automático;
* ativação por código;
* CPU;
* memória;
* armazenamento;
* disco;
* rede;
* uptime;
* hostname;
* sistema operacional;
* heartbeat;
* cache local.

## Portal

* login;
* empresas;
* locais;
* servidores;
* VMs;
* associação VM-servidor;
* ativação;
* dashboard;
* histórico de 24 horas;
* status online e offline;
* alertas de CPU, memória e disco.

## Coletor

* instalação manual;
* cadastro manual de dispositivos;
* ICMP;
* SNMPv2c;
* SNMPv3;
* switches;
* impressoras;
* MikroTik;
* status online e offline;
* interfaces;
* tráfego;
* toner;
* uptime.

---

# 32. Critérios de aceite do MVP

## Agente

* agente instala como serviço no Windows;
* agente instala como serviço systemd no Linux;
* agente inicia após reinicialização;
* agente gera código de ativação;
* código pode ser vinculado pelo portal;
* agente permanece identificado após mudança de IP;
* agente envia métricas;
* agente envia heartbeat;
* agente faz cache quando perde conexão;
* agente reenvia dados após reconexão.

## Portal

* administrador cadastra empresa;
* administrador cadastra local;
* administrador ativa agente;
* administrador vincula VM a servidor;
* usuário visualiza CPU;
* usuário visualiza memória;
* usuário visualiza armazenamento;
* usuário visualiza rede;
* usuário visualiza uptime;
* sistema identifica agente offline;
* sistema cria alerta;
* sistema registra recuperação;
* usuário arquiva equipamento sem perder histórico.

## Coletor

* coletor instala como serviço;
* coletor gera código de ativação;
* coletor consulta dispositivo por ICMP;
* coletor consulta SNMP;
* coletor envia métricas;
* coletor identifica dispositivo offline;
* portal diferencia coletor offline de dispositivo offline;
* impressora apresenta toner quando suportado;
* switch apresenta interfaces quando suportado;
* MikroTik apresenta CPU e interfaces quando suportado.

---

# 33. Indicadores de sucesso

## Técnicos

* redução de falhas causadas por mudança de IP;
* redução de alertas falsos;
* agentes com comunicação estável;
* consumo baixo;
* taxa de envio superior a 99%;
* tempo de detecção de offline inferior a 5 minutos.

## Operacionais

* redução do tempo de diagnóstico;
* menor necessidade de acessar ferramentas separadas;
* instalação manual simples;
* visualização centralizada;
* organização por empresa e local.

## Comerciais

* número de empresas monitoradas;
* número de agentes ativos;
* número de dispositivos;
* receita recorrente;
* taxa de renovação;
* redução de chamados críticos não detectados.

---

# 34. Riscos

## Risco: crescimento excessivo do banco

Mitigação:

* agregação;
* retenção;
* particionamento;
* banco específico para séries temporais futuramente.

## Risco: agente consumir recursos

Mitigação:

* intervalos controlados;
* coleta assíncrona;
* limites internos;
* testes de carga.

## Risco: incompatibilidade entre sistemas

Mitigação:

* lista oficial de sistemas suportados;
* testes por versão;
* fallback de métricas.

## Risco: SNMP inconsistente

Mitigação:

* perfis por fabricante;
* MIBs;
* validação;
* tratamento de métricas ausentes.

## Risco: credenciais expostas

Mitigação:

* criptografia;
* tokens individuais;
* rotação;
* logs sanitizados;
* acesso por função.

## Risco: alertas excessivos

Mitigação:

* duração mínima;
* deduplicação;
* janela de manutenção;
* reconhecimento;
* recuperação automática.

---

# 35. Decisões definidas

As seguintes decisões fazem parte deste PRD:

1. Cada servidor físico terá seu próprio agente.
2. Cada máquina virtual terá seu próprio agente.
3. A instalação será manual.
4. Não haverá instalação por GPO no MVP.
5. O agente será identificado por UUID e token.
6. O IP não será utilizado como identidade.
7. A VM poderá ser vinculada manualmente ao servidor físico.
8. Dispositivos de rede serão monitorados por coletor.
9. O coletor será instalado dentro da rede do cliente.
10. A comunicação externa ocorrerá por HTTPS.
11. O portal não acessará diretamente a rede interna.
12. Não haverá execução remota de comandos no MVP.
13. O histórico não será excluído automaticamente.
14. SNMP será utilizado inicialmente para equipamentos de rede.
15. Atualizações do agente serão manuais no MVP.

---

# 36. Resultado esperado

Ao final do desenvolvimento inicial, a Innerworks deverá possuir uma plataforma capaz de apresentar:

```text
Empresa
└── Local
    ├── Servidores físicos
    │   ├── CPU
    │   ├── Memória
    │   ├── Disco
    │   └── Rede
    │
    ├── Máquinas virtuais
    │   ├── CPU
    │   ├── Memória
    │   ├── Partições
    │   ├── Disco
    │   └── Rede
    │
    └── Dispositivos de rede
        ├── Switches
        ├── Impressoras
        ├── MikroTik
        ├── Access points
        ├── Nobreaks
        └── Sensores
```

O produto deverá funcionar de forma independente de mudanças de endereço IP nos servidores monitorados, utilizando agentes individuais, coletores locais e uma plataforma central integrada ao portal da Innerworks.
