use crate::admin;
use crate::storage_types::{
    DataKey, EscrowData, SecureFlowError, INSTANCE_BUMP_AMOUNT, INSTANCE_LIFETIME_THRESHOLD,
};
use soroban_sdk::{Address, Env, Vec, Error};

// Helper functions for escrow operations
#[allow(dead_code)]
pub fn get_next_escrow_id(env: &Env) -> u32 {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    let current_id: u32 = env
        .storage()
        .instance()
        .get(&DataKey::NextEscrowId)
        .unwrap_or(1);
    current_id
}

pub fn increment_next_escrow_id(env: &Env) -> u32 {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    let current_id: u32 = env
        .storage()
        .instance()
        .get(&DataKey::NextEscrowId)
        .unwrap_or(1);
    let next_id = current_id + 1;
    env.storage()
        .instance()
        .set(&DataKey::NextEscrowId, &next_id);
    current_id
    }

pub fn save_escrow(env: &Env, escrow_id: u32, escrow_data: &EscrowData) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage()
        .instance()
        .set(&DataKey::Escrow(escrow_id), escrow_data);
    }

pub fn get_reputation(env: &Env, user: Address) -> u32 {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage()
        .instance()
        .get(&DataKey::Reputation(user))
        .unwrap_or(0)
    }

pub fn get_escrow(env: &Env, escrow_id: u32) -> Option<EscrowData> {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage().instance().get(&DataKey::Escrow(escrow_id))
    }

pub fn require_valid_escrow(env: &Env, escrow_id: u32) -> Result<(), Error> {
    if escrow_id == 0 || get_escrow(env, escrow_id).is_none() {
    return Err(Error::from_contract_error(SecureFlowError::EscrowNotFound as u32));
    }
    Ok(())
}

pub fn add_user_escrow(env: &Env, user: Address, escrow_id: u32) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    
    let mut escrows: Vec<u32> = env
        .storage()
        .instance()
        .get(&DataKey::UserEscrows(user.clone()))
        .unwrap_or(Vec::new(&env));
    
    escrows.push_back(escrow_id);
    env.storage()
        .instance()
        .set(&DataKey::UserEscrows(user), &escrows);
    }

pub fn get_user_escrows(env: &Env, user: Address) -> Vec<u32> {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage()
        .instance()
        .get(&DataKey::UserEscrows(user))
        .unwrap_or(Vec::new(&env))
    }

pub fn calculate_fee(env: &Env, amount: i128) -> i128 {
    let fee_bp = admin::get_platform_fee_bp(env);
    if fee_bp == 0 {
        return 0;
    }
    (amount * fee_bp as i128) / 10000
    }

#[allow(dead_code)]
pub fn is_authorized_arbiter(env: &Env, arbiter: Address) -> bool {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage()
        .instance()
        .get(&DataKey::AuthorizedArbiter(arbiter))
        .unwrap_or(false)
    }

pub fn is_whitelisted_token(env: &Env, token: Option<Address>) -> bool {
    if token.is_none() {
        return true; // Native XLM is always whitelisted
    }
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage()
        .instance()
        .get(&DataKey::WhitelistedToken(token.unwrap()))
        .unwrap_or(false)
}

