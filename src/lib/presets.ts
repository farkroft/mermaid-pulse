export interface Preset {
  id: string;
  name: string;
  description: string;
  code: string;
}

export const PRESETS: Preset[] = [
  {
    id: "k8s-mesh",
    name: "Kubernetes Ingress & Microservices Mesh",
    description: "Edge gateway, sidecar mesh, and a database with one degraded replica",
    code: `flowchart LR
  Client([Client Traffic]) -->|1400 rps| Ingress[Ingress Controller]
  Ingress -->|1400 rps| Mesh{{Service Mesh}}
  Mesh -->|620 rps| Catalog[Catalog API]
  Mesh -->|480 rps| Cart[Cart API]
  Mesh -->|300 rps| Pricing[Pricing API]
  Catalog -->|600 rps| Cache[(Redis Cache)]
  Cart -->|460 rps| CartDB[(Cart Postgres)]
  Pricing ==>|900 rps| Warehouse[(Analytics Warehouse)]
  %% @node Client status=healthy cpu=18% latency=3ms
  %% @node Ingress status=healthy cpu=34% latency=7ms
  %% @node Mesh status=healthy cpu=51% latency=9ms
  %% @node Catalog status=healthy cpu=46% latency=21ms
  %% @node Cart status=degraded cpu=87% latency=180ms
  %% @node Pricing status=healthy cpu=29% latency=14ms
  %% @node Cache status=healthy cpu=40% latency=2ms
  %% @node CartDB status=healthy cpu=58% latency=16ms
  %% @node Warehouse status=healthy cpu=63% latency=34ms`,
  },
  {
    id: "kafka-pipeline",
    name: "Event-Driven Kafka & Worker Pipeline",
    description: "Async event bus fan-out into workers and a search index",
    code: `flowchart LR
  Producer([Order Producers]) -->|2400 rps| Kafka{{Kafka Event Bus}}
  Kafka -.->|2100 rps| Enricher[Enrichment Worker]
  Kafka -.->|900 rps| Notifier[Notification Worker]
  Kafka -.->|1800 rps| Ledger[Ledger Worker]
  Enricher -->|2100 rps| Search[(Search Index)]
  Ledger ==>|1800 rps| Lake[(Data Lake)]
  Notifier -.->|880 rps| Email[Email Provider]
  %% @node Producer status=healthy cpu=22% latency=4ms
  %% @node Kafka status=healthy cpu=61% latency=6ms
  %% @node Enricher status=degraded cpu=91% latency=210ms
  %% @node Notifier status=healthy cpu=38% latency=18ms
  %% @node Ledger status=healthy cpu=47% latency=12ms
  %% @node Search status=healthy cpu=55% latency=24ms
  %% @node Lake status=healthy cpu=44% latency=40ms
  %% @node Email status=healthy cpu=12% latency=95ms`,
  },
  {
    id: "multi-region-failover",
    name: "Multi-Region Active-Active Database Failover",
    description: "Global load balancer across three regions with replication fan-out",
    code: `flowchart TD
  DNS([Geo DNS]) -->|3200 rps| GLB[Global Load Balancer]
  GLB -->|1600 rps| US[US-East Cluster]
  GLB -->|1100 rps| EU[EU-West Cluster]
  GLB -->|500 rps| AP[AP-South Cluster]
  US ==>|1600 rps| USDB[(US Primary)]
  EU ==>|1100 rps| EUDB[(EU Primary)]
  AP ==>|500 rps| APDB[(AP Primary)]
  USDB -.->|replication| EUDB
  EUDB -.->|replication| APDB
  APDB -.->|replication| USDB
  %% @node DNS status=healthy cpu=9% latency=2ms
  %% @node GLB status=healthy cpu=37% latency=5ms
  %% @node US status=healthy cpu=64% latency=18ms
  %% @node EU status=degraded cpu=89% latency=240ms
  %% @node AP status=healthy cpu=52% latency=26ms
  %% @node USDB status=healthy cpu=71% latency=11ms
  %% @node EUDB status=healthy cpu=68% latency=14ms
  %% @node APDB status=healthy cpu=49% latency=19ms`,
  },
  {
    id: "checkout-sequence",
    name: "High-Concurrency Checkout Sequence Diagram",
    description: "Payment authorization handshake with an async settlement tap",
    code: `sequenceDiagram
  participant Client as Checkout Client
  participant API as Checkout API
  participant Risk as Risk Engine
  participant PSP as Payment Provider
  participant Ledger as Ledger Store
  Client->>API: POST /checkout
  API->>Risk: score(order)
  Risk-->>API: 200 allow
  API->>PSP: authorize(card)
  PSP-->>API: 200 captured
  API->>Ledger: append(entry)
  Ledger-->>API: 201 stored
  API-->>Client: 201 order confirmed
  %% @node Client status=healthy cpu=15% latency=8ms
  %% @node API status=healthy cpu=57% latency=22ms
  %% @node Risk status=degraded cpu=84% latency=190ms
  %% @node PSP status=healthy cpu=33% latency=140ms
  %% @node Ledger status=healthy cpu=61% latency=16ms
  %% @edge Client->API rps=1800 latency=22ms
  %% @edge API->Risk rps=1800 latency=14ms
  %% @edge Risk->API rps=1800 latency=190ms
  %% @edge API->PSP rps=1750 latency=140ms
  %% @edge PSP->API rps=1750 latency=120ms
  %% @edge API->Ledger rps=1720 latency=16ms
  %% @edge Ledger->API rps=1720 latency=12ms
  %% @edge API->Client rps=1700 latency=8ms`,
  },
  {
    id: "network-topology",
    name: "High-Level Network Topology",
    description: "Edge ingress, perimeter firewall, DMZ segmentation, and a degraded branch VPN",
    code: `flowchart TD
  Internet([Public Internet]) -->|2600 rps| ISP[ISP Uplink]
  ISP -->|2600 rps| EdgeRouter[Edge Router]
  EdgeRouter -->|2500 rps| Firewall[Perimeter Firewall]
  Firewall -->|2400 rps| LoadBalancer[Load Balancer]
  subgraph DMZ[DMZ VLAN 10]
    LoadBalancer -->|2400 rps| WAF[WAF Proxy]
  end
  subgraph CORE[Core Backbone VLAN 20]
    WAF -->|2300 rps| CoreSwitch[Core Switch Pair]
  end
  CoreSwitch ==>|2200 rps| AppTier[App Server Pool]
  AppTier -->|2000 rps| Database[(Primary Database)]
  CoreSwitch -.->|300 rps| VPN{{Site-to-Site VPN}}
  VPN -.->|280 rps| Branch[Branch Office]
  %% @node Internet status=healthy cpu=6% latency=2ms
  %% @node ISP status=healthy cpu=14% latency=9ms
  %% @node EdgeRouter status=healthy cpu=41% latency=4ms
  %% @node Firewall status=healthy cpu=63% latency=7ms
  %% @node LoadBalancer status=healthy cpu=48% latency=3ms
  %% @node WAF status=healthy cpu=55% latency=11ms
  %% @node CoreSwitch status=healthy cpu=37% latency=2ms
  %% @node AppTier status=healthy cpu=72% latency=26ms
  %% @node Database status=healthy cpu=68% latency=8ms
  %% @node VPN status=degraded cpu=88% latency=210ms
  %% @node Branch status=healthy cpu=22% latency=34ms`,
  },
];

export const DEFAULT_PRESET = PRESETS[0];

export const DEFAULT_CODE = DEFAULT_PRESET.code;
