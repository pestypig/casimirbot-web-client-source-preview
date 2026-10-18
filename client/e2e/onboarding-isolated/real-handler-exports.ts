// Test-only entry point. No listener, authentication bypass or production hook.
export { createAgentConnectionsRouter } from "../../../server/routes/agent-connections";
export { isPairingEnvironmentEligible } from "../../../server/services/local-supervisor/pairing-environment-eligibility";
export { setEnvironmentFixturePool } from "./environment-database-port";
export { migration087 } from "../../../server/db/migrations/087_pairing_ledger";
export { migration088 } from "../../../server/db/migrations/088_pairing_destinations";
export { migration089 } from "../../../server/db/migrations/089_pairing_destination_identity";
export { migration090 } from "../../../server/db/migrations/090_durable_steering";
export { DurableSteeringRepository } from "../../../server/services/local-supervisor/durable-steering-repository";
export { PairingDestinationRegistrationStore } from "../../../server/services/local-supervisor/pairing-destination-registration";
export { PairingLedgerRepository } from "../../../server/services/local-supervisor/pairing-ledger-repository";
export { PairingTransitionService } from "../../../server/services/local-supervisor/pairing-transition-service";
export { commitEmbeddedPairingReplacement } from "../../../server/services/local-supervisor/embedded-pairing-replacement-commit";
export { DurableReasoningBindingAccess } from "../../../server/services/local-supervisor/durable-reasoning-binding-access";
export { HelixReasoningTaskBindingStore } from "../../../server/services/local-supervisor/reasoning-task-binding-store";
export { ephemeralPairingVault } from "../../../server/services/local-supervisor/__tests__/pairing-vault-fixture";

export { migration091 } from "../../../server/db/migrations/091_pairing_delivery";
export { PairingDeliveryRepository } from "../../../server/services/local-supervisor/pairing-delivery-repository";
export { PairingDeliveryService } from "../../../server/services/local-supervisor/pairing-delivery-service";
