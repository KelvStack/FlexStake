import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const simnet = (globalThis as any).simnet;

const accounts = simnet.getAccounts();
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;
const deployer = accounts.get("deployer")!;

const contractName = "flex-stake";

// Constants from contract
const MIN_STAKE_AMOUNT = 1000000; // 1 STX
const UNSTAKING_PERIOD = 2016; // ~2 weeks in blocks
const PROTOCOL_FEE_RATE = 100; // 1%
const REWARD_CYCLE = 2100;

describe("FlexStake Contract Tests", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  describe("Read-Only Functions", () => {
    it("get-staking-pool returns none for non-existent validator", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-staking-pool", [Cl.principal(address1)], deployer);
      expect(result).toBeNone();
    });

    it("get-user-stake returns none for non-existent stake", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-user-stake", [
        Cl.principal(address1),
        Cl.principal(address2)
      ], deployer);
      expect(result).toBeNone();
    });

    it("get-liquid-token-balance returns default values for new user", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-liquid-token-balance", [Cl.principal(address1)], deployer);
      expect(result).toBeTuple({
        balance: Cl.uint(0),
        "last-claim-cycle": Cl.uint(0),
      });
    });

    it("get-protocol-stats returns correct initial values", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-protocol-stats", [], deployer);
      expect(result).toBeOk(
        Cl.tuple({
          "total-staked": Cl.uint(0),
          "total-liquid-tokens": Cl.uint(0),
          "exchange-rate": Cl.uint(1000000),
          "protocol-fees": Cl.uint(0),
          "current-cycle": Cl.uint(0),
        })
      );
    });

    it("calculate-liquid-tokens works correctly", () => {
      const stxAmount = 1000000; // 1 STX
      const { result } = simnet.callReadOnlyFn(contractName, "calculate-liquid-tokens", [Cl.uint(stxAmount)], deployer);
      expect(result).toBeUint(1000000); // 1:1 ratio initially
    });

    it("calculate-stx-value works correctly", () => {
      const liquidTokens = 1000000;
      const { result } = simnet.callReadOnlyFn(contractName, "calculate-stx-value", [Cl.uint(liquidTokens)], deployer);
      expect(result).toBeUint(1000000); // 1:1 ratio initially
    });

    it("get-unstaking-request returns none for non-existent request", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-unstaking-request", [
        Cl.principal(address1),
        Cl.uint(0)
      ], deployer);
      expect(result).toBeNone();
    });

    it("calculate-pending-rewards returns zero for non-existent stake", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "calculate-pending-rewards", [
        Cl.principal(address1),
        Cl.principal(address2)
      ], deployer);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("get-user-yield returns zero for non-existent stake", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-user-yield", [
        Cl.principal(address1),
        Cl.principal(address2)
      ], deployer);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("get-delegation-offer returns none for non-existent offer", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-delegation-offer", [Cl.uint(0)], deployer);
      expect(result).toBeNone();
    });

    it("get-delegation-request returns none for non-existent request", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-delegation-request", [
        Cl.principal(address1),
        Cl.uint(0)
      ], deployer);
      expect(result).toBeNone();
    });

    it("get-lending-position returns none for non-existent position", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-lending-position", [Cl.uint(0)], deployer);
      expect(result).toBeNone();
    });

    it("get-active-offers returns initial counter value", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-active-offers", [], deployer);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("calculate-ltv-ratio returns zero for non-existent position", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "calculate-ltv-ratio", [Cl.uint(0)], deployer);
      expect(result).toBeOk(Cl.uint(0));
    });

    it("get-marketplace-stats returns initial values", () => {
      const { result } = simnet.callReadOnlyFn(contractName, "get-marketplace-stats", [], deployer);
      expect(result).toBeOk(
        Cl.tuple({
          "total-offers": Cl.uint(0),
          "total-lending-positions": Cl.uint(0),
          "protocol-tvl": Cl.uint(0),
          "liquid-token-supply": Cl.uint(0),
        })
      );
    });
  });

  describe("Register Validator Function", () => {
    it("register-validator allows valid registration", () => {
      const { result } = simnet.callPublicFn(contractName, "register-validator", [
        Cl.uint(1000) // 10% commission
      ], address1);
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("register-validator stores validator information correctly", () => {
      const commissionRate = 1000;
      simnet.callPublicFn(contractName, "register-validator", [Cl.uint(commissionRate)], address1);

      const { result } = simnet.callReadOnlyFn(contractName, "get-staking-pool", [Cl.principal(address1)], deployer);
      expect(result).toBeSome(
        Cl.tuple({
          "total-delegated": Cl.uint(0),
          "liquid-tokens-issued": Cl.uint(0),
          active: Cl.bool(true),
          "commission-rate": Cl.uint(commissionRate),
          "validator-rewards": Cl.uint(0),
          "last-reward-cycle": Cl.uint(0),
        })
      );
    });

    it("register-validator validates commission rate maximum", () => {
      const { result } = simnet.callPublicFn(contractName, "register-validator", [
        Cl.uint(2100) // 21% > 20% maximum
      ], address1);
      
      expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
    });

    it("register-validator prevents duplicate registration", () => {
      // First registration
      simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);

      // Second registration attempt
      const { result } = simnet.callPublicFn(contractName, "register-validator", [
        Cl.uint(1500)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(105)); // err-already-staking
    });

    it("register-validator prevents registration when contract is paused", () => {
      // Pause contract
      simnet.callPublicFn(contractName, "toggle-contract-pause", [], deployer);

      const { result } = simnet.callPublicFn(contractName, "register-validator", [
        Cl.uint(1000)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(101)); // err-not-authorized
    });
  });

  describe("Update Validator Commission Function", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
    });

    it("update-validator-commission allows validator to update commission", () => {
      const { result } = simnet.callPublicFn(contractName, "update-validator-commission", [
        Cl.uint(1500) // 15%
      ], address1);
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("update-validator-commission updates commission rate", () => {
      const newCommission = 1500;
      simnet.callPublicFn(contractName, "update-validator-commission", [Cl.uint(newCommission)], address1);

      const { result } = simnet.callReadOnlyFn(contractName, "get-staking-pool", [Cl.principal(address1)], deployer);
      expect(result).toBeSome(
        Cl.tuple({
          "total-delegated": Cl.uint(0),
          "liquid-tokens-issued": Cl.uint(0),
          active: Cl.bool(true),
          "commission-rate": Cl.uint(newCommission),
          "validator-rewards": Cl.uint(0),
          "last-reward-cycle": Cl.uint(0),
        })
      );
    });

    it("update-validator-commission validates commission rate maximum", () => {
      const { result } = simnet.callPublicFn(contractName, "update-validator-commission", [
        Cl.uint(2100) // 21% > 20% maximum
      ], address1);
      
      expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
    });

    it("update-validator-commission prevents non-validator from updating", () => {
      const { result } = simnet.callPublicFn(contractName, "update-validator-commission", [
        Cl.uint(1500)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(104)); // err-pool-not-found
    });

    it("update-validator-commission requires active validator", () => {
      // Deactivate validator first
      simnet.callPublicFn(contractName, "deactivate-validator", [], address1);

      const { result } = simnet.callPublicFn(contractName, "update-validator-commission", [
        Cl.uint(1500)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(101)); // err-not-authorized
    });
  });

  describe("Deactivate Validator Function", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
    });

    it("deactivate-validator allows validator to deactivate", () => {
      const { result } = simnet.callPublicFn(contractName, "deactivate-validator", [], address1);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("deactivate-validator updates validator status", () => {
      simnet.callPublicFn(contractName, "deactivate-validator", [], address1);

      const { result } = simnet.callReadOnlyFn(contractName, "get-staking-pool", [Cl.principal(address1)], deployer);
      expect(result).toBeSome(
        Cl.tuple({
          "total-delegated": Cl.uint(0),
          "liquid-tokens-issued": Cl.uint(0),
          active: Cl.bool(false),
          "commission-rate": Cl.uint(1000),
          "validator-rewards": Cl.uint(0),
          "last-reward-cycle": Cl.uint(0),
        })
      );
    });

    it("deactivate-validator prevents non-validator from deactivating", () => {
      const { result } = simnet.callPublicFn(contractName, "deactivate-validator", [], address2);
      expect(result).toBeErr(Cl.uint(104)); // err-pool-not-found
    });

    it("deactivate-validator requires active validator", () => {
      // Deactivate first
      simnet.callPublicFn(contractName, "deactivate-validator", [], address1);

      // Try to deactivate again
      const { result } = simnet.callPublicFn(contractName, "deactivate-validator", [], address1);
      expect(result).toBeErr(Cl.uint(101)); // err-not-authorized
    });
  });

  describe("Stake STX Function", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
    });

    it("stake-stx allows valid staking", () => {
      const stakeAmount = MIN_STAKE_AMOUNT * 2;
      const { result } = simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(stakeAmount)
      ], address2);
      
      expect(result).toBeOk(Cl.uint(expect.any(Number))); // Returns liquid tokens
    });

    it("stake-stx creates user stake correctly", () => {
      const stakeAmount = MIN_STAKE_AMOUNT * 2;
      simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(stakeAmount)
      ], address2);

      const { result } = simnet.callReadOnlyFn(contractName, "get-user-stake", [
        Cl.principal(address2),
        Cl.principal(address1)
      ], deployer);
      
      const protocolFee = Math.floor(stakeAmount * PROTOCOL_FEE_RATE / 10000);
      const netStake = stakeAmount - protocolFee;
      
      expect(result).toBeSome(
        Cl.tuple({
          "stx-amount": Cl.uint(netStake),
          "liquid-tokens": Cl.uint(expect.any(Number)),
          "stake-height": Cl.uint(simnet.blockHeight),
          "unstaking-height": Cl.none(),
          "rewards-claimed": Cl.uint(0),
        })
      );
    });

    it("stake-stx updates liquid token balance", () => {
      const stakeAmount = MIN_STAKE_AMOUNT * 2;
      simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(stakeAmount)
      ], address2);

      const { result } = simnet.callReadOnlyFn(contractName, "get-liquid-token-balance", [Cl.principal(address2)], deployer);
      expect(result).toBeTuple({
        balance: Cl.uint(expect.any(Number)),
        "last-claim-cycle": Cl.uint(0),
      });
    });

    it("stake-stx validates minimum stake amount", () => {
      const { result } = simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(MIN_STAKE_AMOUNT - 1)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
    });

    it("stake-stx prevents staking with inactive validator", () => {
      // Deactivate validator
      simnet.callPublicFn(contractName, "deactivate-validator", [], address1);

      const { result } = simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(MIN_STAKE_AMOUNT)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(108)); // err-invalid-validator
    });

    it("stake-stx prevents staking with non-existent validator", () => {
      const { result } = simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address3),
        Cl.uint(MIN_STAKE_AMOUNT)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(104)); // err-pool-not-found
    });

    it("stake-stx prevents staking when contract is paused", () => {
      simnet.callPublicFn(contractName, "toggle-contract-pause", [], deployer);

      const { result } = simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(MIN_STAKE_AMOUNT)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(101)); // err-not-authorized
    });

    it("stake-stx accumulates multiple stakes", () => {
      const firstStake = MIN_STAKE_AMOUNT;
      const secondStake = MIN_STAKE_AMOUNT * 2;

      simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(firstStake)
      ], address2);

      simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(secondStake)
      ], address2);

      const { result } = simnet.callReadOnlyFn(contractName, "get-user-stake", [
        Cl.principal(address2),
        Cl.principal(address1)
      ], deployer);

      const totalAmount = firstStake + secondStake;
      const totalProtocolFee = Math.floor(totalAmount * PROTOCOL_FEE_RATE / 10000);
      const totalNetStake = totalAmount - totalProtocolFee;

      expect(result).toBeSome(
        Cl.tuple({
          "stx-amount": Cl.uint(totalNetStake),
          "liquid-tokens": Cl.uint(expect.any(Number)),
          "stake-height": Cl.uint(expect.any(Number)),
          "unstaking-height": Cl.none(),
          "rewards-claimed": Cl.uint(0),
        })
      );
    });
  });

  describe("Administrative Functions", () => {
    it("update-current-cycle allows owner to update cycle", () => {
      const { result } = simnet.callPublicFn(contractName, "update-current-cycle", [
        Cl.uint(5)
      ], deployer);
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("update-current-cycle prevents non-owner from updating", () => {
      const { result } = simnet.callPublicFn(contractName, "update-current-cycle", [
        Cl.uint(5)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(100)); // err-owner-only
    });

    it("toggle-contract-pause allows owner to pause", () => {
      const { result } = simnet.callPublicFn(contractName, "toggle-contract-pause", [], deployer);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("toggle-contract-pause prevents non-owner from toggling", () => {
      const { result } = simnet.callPublicFn(contractName, "toggle-contract-pause", [], address1);
      expect(result).toBeErr(Cl.uint(100)); // err-owner-only
    });

    it("withdraw-protocol-fees allows owner to withdraw", () => {
      const { result } = simnet.callPublicFn(contractName, "withdraw-protocol-fees", [], deployer);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("withdraw-protocol-fees prevents non-owner from withdrawing", () => {
      const { result } = simnet.callPublicFn(contractName, "withdraw-protocol-fees", [], address1);
      expect(result).toBeErr(Cl.uint(100)); // err-owner-only
    });
  });

  describe("Unstaking Functions", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
      simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(MIN_STAKE_AMOUNT * 5)
      ], address2);
    });

    it("initiate-unstaking allows valid unstaking request", () => {
      const { result } = simnet.callPublicFn(contractName, "initiate-unstaking", [
        Cl.principal(address1),
        Cl.uint(1000000)
      ], address2);
      
      expect(result).toBeOk(Cl.uint(0)); // First request ID
    });

    it("initiate-unstaking prevents zero amount", () => {
      const { result } = simnet.callPublicFn(contractName, "initiate-unstaking", [
        Cl.principal(address1),
        Cl.uint(0)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
    });

    it("initiate-unstaking prevents when contract is paused", () => {
      simnet.callPublicFn(contractName, "toggle-contract-pause", [], deployer);

      const { result } = simnet.callPublicFn(contractName, "initiate-unstaking", [
        Cl.principal(address1),
        Cl.uint(1000000)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(101)); // err-not-authorized
    });

    it("complete-unstaking prevents completion before period", () => {
      // Initiate unstaking
      simnet.callPublicFn(contractName, "initiate-unstaking", [
        Cl.principal(address1),
        Cl.uint(1000000)
      ], address2);

      // Try to complete immediately
      const { result } = simnet.callPublicFn(contractName, "complete-unstaking", [
        Cl.uint(0)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(107)); // err-unstaking-period
    });

    it("complete-unstaking allows completion after period", () => {
      // Initiate unstaking
      simnet.callPublicFn(contractName, "initiate-unstaking", [
        Cl.principal(address1),
        Cl.uint(1000000)
      ], address2);

      // Mine blocks to pass unstaking period
      simnet.mineEmptyBlocks(UNSTAKING_PERIOD + 1);

      const { result } = simnet.callPublicFn(contractName, "complete-unstaking", [
        Cl.uint(0)
      ], address2);
      
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("Rewards Functions", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
      simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(MIN_STAKE_AMOUNT * 10)
      ], address2);
    });

    it("distribute-rewards allows validator to distribute", () => {
      const { result } = simnet.callPublicFn(contractName, "distribute-rewards", [
        Cl.principal(address1),
        Cl.uint(500000)
      ], address1);
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("distribute-rewards prevents non-validator from distributing", () => {
      const { result } = simnet.callPublicFn(contractName, "distribute-rewards", [
        Cl.principal(address1),
        Cl.uint(500000)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(101)); // err-not-authorized
    });

    it("distribute-rewards validates amount", () => {
      const { result } = simnet.callPublicFn(contractName, "distribute-rewards", [
        Cl.principal(address1),
        Cl.uint(0)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
    });

    it("claim-validator-rewards allows validator to claim", () => {
      // First distribute rewards
      simnet.callPublicFn(contractName, "distribute-rewards", [
        Cl.principal(address1),
        Cl.uint(500000)
      ], address1);

      const { result } = simnet.callPublicFn(contractName, "claim-validator-rewards", [], address1);
      expect(result).toBeOk(Cl.uint(expect.any(Number)));
    });

    it("claim-staking-rewards allows reward claiming", () => {
      // First distribute rewards to increase value
      simnet.callPublicFn(contractName, "distribute-rewards", [
        Cl.principal(address1),
        Cl.uint(1000000)
      ], address1);

      const { result } = simnet.callPublicFn(contractName, "claim-staking-rewards", [
        Cl.principal(address1)
      ], address2);
      
      expect(result).toBeOk(Cl.uint(expect.any(Number)));
    });
  });

  describe("Liquid Token Transfer Function", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
      simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(MIN_STAKE_AMOUNT * 5)
      ], address2);
    });

    it("transfer-liquid-tokens allows valid transfer", () => {
      const { result } = simnet.callPublicFn(contractName, "transfer-liquid-tokens", [
        Cl.principal(address3),
        Cl.uint(500000)
      ], address2);
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("transfer-liquid-tokens prevents zero amount", () => {
      const { result } = simnet.callPublicFn(contractName, "transfer-liquid-tokens", [
        Cl.principal(address3),
        Cl.uint(0)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
    });

    it("transfer-liquid-tokens prevents self-transfer", () => {
      const { result } = simnet.callPublicFn(contractName, "transfer-liquid-tokens", [
        Cl.principal(address2),
        Cl.uint(100000)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
    });

    it("transfer-liquid-tokens prevents when contract is paused", () => {
      simnet.callPublicFn(contractName, "toggle-contract-pause", [], deployer);

      const { result } = simnet.callPublicFn(contractName, "transfer-liquid-tokens", [
        Cl.principal(address3),
        Cl.uint(100000)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(101)); // err-not-authorized
    });
  });

  describe("Auto-Compound Rewards Function", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
      simnet.callPublicFn(contractName, "stake-stx", [
        Cl.principal(address1),
        Cl.uint(MIN_STAKE_AMOUNT * 10)
      ], address2);
      simnet.callPublicFn(contractName, "update-current-cycle", [Cl.uint(5)], deployer);
    });

    it("auto-compound-rewards allows compounding", () => {
      const { result } = simnet.callPublicFn(contractName, "auto-compound-rewards", [
        Cl.principal(address1)
      ], address2);
      
      expect(result).toBeOk(Cl.uint(expect.any(Number)));
    });

    it("auto-compound-rewards prevents with inactive validator", () => {
      simnet.callPublicFn(contractName, "deactivate-validator", [], address1);

      const { result } = simnet.callPublicFn(contractName, "auto-compound-rewards", [
        Cl.principal(address1)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(108)); // err-invalid-validator
    });
  });

  describe("Delegation Marketplace Functions", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
    });

    it("create-delegation-offer allows validator to create offer", () => {
      const { result } = simnet.callPublicFn(contractName, "create-delegation-offer", [
        Cl.uint(1200), // 12% commission
        Cl.uint(MIN_STAKE_AMOUNT),
        Cl.uint(MIN_STAKE_AMOUNT * 100),
        Cl.uint(4320)
      ], address1);
      
      expect(result).toBeOk(Cl.uint(0));
    });

    it("create-delegation-offer validates commission rate", () => {
      const { result } = simnet.callPublicFn(contractName, "create-delegation-offer", [
        Cl.uint(1600), // 16% > 15% max for marketplace
        Cl.uint(MIN_STAKE_AMOUNT),
        Cl.uint(MIN_STAKE_AMOUNT * 100),
        Cl.uint(4320)
     ], address1);
     
     expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
   });

   it("accept-delegation-offer allows valid acceptance", () => {
     // Create offer first
     simnet.callPublicFn(contractName, "create-delegation-offer", [
       Cl.uint(1200),
       Cl.uint(MIN_STAKE_AMOUNT),
       Cl.uint(MIN_STAKE_AMOUNT * 100),
       Cl.uint(4320)
     ], address1);

     const { result } = simnet.callPublicFn(contractName, "accept-delegation-offer", [
       Cl.uint(0),
       Cl.uint(MIN_STAKE_AMOUNT * 2)
     ], address2);
     
     expect(result).toBeOk(Cl.bool(true));
   });

   it("cancel-delegation-offer allows validator to cancel", () => {
     // Create offer first
     simnet.callPublicFn(contractName, "create-delegation-offer", [
       Cl.uint(1200),
       Cl.uint(MIN_STAKE_AMOUNT),
       Cl.uint(MIN_STAKE_AMOUNT * 100),
       Cl.uint(4320)
     ], address1);

     const { result } = simnet.callPublicFn(contractName, "cancel-delegation-offer", [
       Cl.uint(0)
     ], address1);
     
     expect(result).toBeOk(Cl.bool(true));
   });
 });

 describe("DeFi Integration - Lending Functions", () => {
   beforeEach(() => {
     simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
     simnet.callPublicFn(contractName, "stake-stx", [
       Cl.principal(address1),
       Cl.uint(MIN_STAKE_AMOUNT * 20)
     ], address2);
   });

   it("create-lending-position allows valid lending position", () => {
     const { result } = simnet.callPublicFn(contractName, "create-lending-position", [
       Cl.uint(10000000), // collateral
       Cl.uint(5000000), // borrow amount
       Cl.uint(500), // interest rate
       Cl.uint(4320) // duration
     ], address2);
     
     expect(result).toBeOk(Cl.uint(0));
   });

   it("create-lending-position validates LTV ratio", () => {
     const { result } = simnet.callPublicFn(contractName, "create-lending-position", [
       Cl.uint(10000000),
       Cl.uint(8000000), // 80% LTV > 75% max
       Cl.uint(500),
       Cl.uint(4320)
     ], address2);
     
     expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
   });

   it("repay-lending-position allows position repayment", () => {
     // Create position first
     simnet.callPublicFn(contractName, "create-lending-position", [
       Cl.uint(10000000),
       Cl.uint(5000000),
       Cl.uint(500),
       Cl.uint(4320)
     ], address2);

     const { result } = simnet.callPublicFn(contractName, "repay-lending-position", [
       Cl.uint(0)
     ], address2);
     
     expect(result).toBeOk(Cl.bool(true));
   });

   it("liquidate-lending-position prevents liquidation of healthy positions", () => {
     // Create healthy position
     simnet.callPublicFn(contractName, "create-lending-position", [
       Cl.uint(10000000),
       Cl.uint(5000000), // 50% LTV - healthy
       Cl.uint(500),
       Cl.uint(4320)
     ], address2);

     const { result } = simnet.callPublicFn(contractName, "liquidate-lending-position", [
       Cl.uint(0)
     ], address3);
     
     expect(result).toBeErr(Cl.uint(101)); // err-not-authorized
   });
 });

 describe("Yield Farming Function", () => {
   beforeEach(() => {
     simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
     simnet.callPublicFn(contractName, "stake-stx", [
       Cl.principal(address1),
       Cl.uint(MIN_STAKE_AMOUNT * 20)
     ], address2);
   });

   it("deposit-for-yield allows valid yield farming", () => {
     const { result } = simnet.callPublicFn(contractName, "deposit-for-yield", [
       Cl.uint(5000000), // amount
       Cl.uint(4320) // farming period
     ], address2);
     
     expect(result).toBeOk(Cl.uint(expect.any(Number)));
   });

   it("deposit-for-yield validates minimum period", () => {
     const { result } = simnet.callPublicFn(contractName, "deposit-for-yield", [
       Cl.uint(5000000),
       Cl.uint(100) // Less than 144 blocks minimum
     ], address2);
     
     expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
   });

   it("deposit-for-yield prevents when contract is paused", () => {
     simnet.callPublicFn(contractName, "toggle-contract-pause", [], deployer);

     const { result } = simnet.callPublicFn(contractName, "deposit-for-yield", [
       Cl.uint(5000000),
       Cl.uint(4320)
     ], address2);
     
     expect(result).toBeErr(Cl.uint(101)); // err-not-authorized
   });
 });

 describe("Emergency Functions", () => {
   beforeEach(() => {
     simnet.callPublicFn(contractName, "register-validator", [Cl.uint(1000)], address1);
     simnet.callPublicFn(contractName, "stake-stx", [
       Cl.principal(address1),
       Cl.uint(MIN_STAKE_AMOUNT * 20)
     ], address2);
     simnet.callPublicFn(contractName, "create-lending-position", [
       Cl.uint(10000000),
       Cl.uint(5000000),
       Cl.uint(500),
       Cl.uint(4320)
     ], address2);
   });

   it("emergency-close-lending-position allows owner to close", () => {
     const { result } = simnet.callPublicFn(contractName, "emergency-close-lending-position", [
       Cl.uint(0)
     ], deployer);
     
     expect(result).toBeOk(Cl.bool(true));
   });

   it("emergency-close-lending-position prevents non-owner from closing", () => {
     const { result } = simnet.callPublicFn(contractName, "emergency-close-lending-position", [
       Cl.uint(0)
     ], address1);
     
     expect(result).toBeErr(Cl.uint(100)); // err-owner-only
   });

   it("update-protocol-parameters allows owner to update", () => {
     const { result } = simnet.callPublicFn(contractName, "update-protocol-parameters", [
       Cl.uint(2000000), // new min stake
       Cl.uint(200) // new fee rate
     ], deployer);
     
     expect(result).toBeOk(Cl.bool(true));
   });

   it("update-protocol-parameters prevents non-owner from updating", () => {
     const { result } = simnet.callPublicFn(contractName, "update-protocol-parameters", [
       Cl.uint(2000000),
       Cl.uint(200)
     ], address1);
     
     expect(result).toBeErr(Cl.uint(100)); // err-owner-only
   });

   it("update-protocol-parameters validates parameters", () => {
     // Invalid min stake (zero)
     let { result } = simnet.callPublicFn(contractName, "update-protocol-parameters", [
       Cl.uint(0),
       Cl.uint(200)
     ], deployer);
     expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount

     // Invalid fee rate (> 5%)
     ({ result } = simnet.callPublicFn(contractName, "update-protocol-parameters", [
       Cl.uint(2000000),
       Cl.uint(600) // 6% > 5% max
     ], deployer));
     expect(result).toBeErr(Cl.uint(103)); // err-invalid-amount
   });
 });
});