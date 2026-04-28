use crate::storage_types::{
    DataKey, SecureFlowError, INSTANCE_BUMP_AMOUNT, INSTANCE_LIFETIME_THRESHOLD,
};
use soroban_sdk::{token, Address, Env, Error, Vec};

pub fn initialize(
    env: &Env,
    owner: Address,
    fee_collector: Address,
    platform_fee_bp: u32,
    default_whitelisted_tokens: Vec<Address>,
) -> Result<(), Error> {
    // Check if already initialized
    if env.storage().instance().has(&DataKey::Owner) {
        return Err(Error::from_contract_error(SecureFlowError::AlreadyInitialized as u32));
    }

    // Validate parameters
    if platform_fee_bp > 1000 {
        // Max 10% (1000 basis points)
        return Err(Error::from_contract_error(SecureFlowError::FeeTooHigh as u32));
    }

    // Extend instance TTL
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

    // Set initial state
    env.storage().instance().set(&DataKey::Owner, &owner);
    env.storage()
        .instance()
        .set(&DataKey::FeeCollector, &fee_collector);
    env.storage()
        .instance()
        .set(&DataKey::PlatformFeeBP, &platform_fee_bp);
    env.storage().instance().set(&DataKey::NextEscrowId, &1u32);
    env.storage()
        .instance()
        .set(&DataKey::JobCreationPaused, &false);

    // Initialize lists
    env.storage()
        .instance()
        .set(&DataKey::WhitelistedTokens, &Vec::<Address>::new(env));
    env.storage()
        .instance()
        .set(&DataKey::AuthorizedArbiters, &Vec::<Address>::new(env));

    // Default whitelisted tokens (e.g., USDC on Stellar)
    for t in default_whitelisted_tokens.iter() {
        env.storage()
            .instance()
            .set(&DataKey::WhitelistedToken(t.clone()), &true);
        add_to_list_unique(env, DataKey::WhitelistedTokens, t.clone());
    }
    
    Ok(())
}

pub fn get_owner(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Owner)
        .ok_or_else(|| Error::from_contract_error(SecureFlowError::NotInitialized as u32))
}

pub fn require_owner(env: &Env) -> Result<(), Error> {
    let owner = get_owner(env)?;
    owner.require_auth();
    Ok(())
}

#[allow(dead_code)]
pub fn get_fee_collector(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::FeeCollector)
        .ok_or_else(|| Error::from_contract_error(SecureFlowError::NotInitialized as u32))
}

pub fn get_platform_fee_bp(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::PlatformFeeBP)
        .unwrap_or(0)
}

pub fn set_platform_fee_bp(env: &Env, fee_bp: u32) -> Result<(), Error> {
    require_owner(env)?;
    if fee_bp > 1000 {
        return Err(Error::from_contract_error(SecureFlowError::FeeTooHigh as u32));
    }
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage().instance().set(&DataKey::PlatformFeeBP, &fee_bp);
    Ok(())
}

pub fn set_fee_collector(env: &Env, fee_collector: Address) -> Result<(), Error> {
    require_owner(env)?;
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage()
        .instance()
        .set(&DataKey::FeeCollector, &fee_collector);
    Ok(())
}

pub fn set_owner(env: &Env, new_owner: Address) -> Result<(), Error> {
    require_owner(env)?;
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage()
        .instance()
        .set(&DataKey::Owner, &new_owner);
    Ok(())
}

pub fn add_to_list_unique(env: &Env, key: DataKey, value: Address) {
    let mut list: Vec<Address> = env.storage().instance().get(&key).unwrap_or(Vec::new(env));
    let mut exists = false;
    for item in list.iter() {
        if item == value {
            exists = true;
            break;
        }
    }
    if !exists {
        list.push_back(value);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        env.storage().instance().set(&key, &list);
    }
}

pub fn remove_from_list(env: &Env, key: DataKey, value: &Address) {
    let list: Vec<Address> = env.storage().instance().get(&key).unwrap_or(Vec::new(env));
    let mut new_list: Vec<Address> = Vec::new(env);
    for item in list.iter() {
        if &item != value {
            new_list.push_back(item);
        }
    }
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage().instance().set(&key, &new_list);
}

pub fn remove_arbiter(env: &Env, arbiter: Address) -> Result<(), Error> {
    require_owner(env)?;
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    // Remove the individual lookup key
    env.storage()
        .instance()
        .remove(&DataKey::AuthorizedArbiter(arbiter.clone()));
    // Remove from the list
    remove_from_list(env, DataKey::AuthorizedArbiters, &arbiter);
    Ok(())
}

/// Owner-only: withdraw only the "excess" balance above what is currently escrowed.
/// This protects active escrows while allowing recovery of accidental transfers.
pub fn withdraw_stuck_funds(
    env: &Env,
    token_addr: Address,
    to: Address,
    amount: i128,
) -> Result<(), Error> {
    require_owner(env)?;

    if amount <= 0 {
        return Err(Error::from_contract_error(SecureFlowError::InvalidAmount as u32));
    }

    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

    let escrowed: i128 = env
        .storage()
        .instance()
        .get(&DataKey::EscrowedAmount(token_addr.clone()))
        .unwrap_or(0);

    // Read actual on-chain token balance for this contract
    let token_client = token::Client::new(env, &token_addr);
    let bal = token_client.balance(&env.current_contract_address());

    let withdrawable = bal - escrowed;
    if withdrawable <= 0 || amount > withdrawable {
        return Err(Error::from_contract_error(
            SecureFlowError::InsufficientWithdrawable as u32,
        ));
    }

    token_client.transfer(&env.current_contract_address(), &to, &amount);
    Ok(())
}

pub fn is_job_creation_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::JobCreationPaused)
        .unwrap_or(false)
}

#[allow(dead_code)]
pub fn set_job_creation_paused(env: &Env, paused: bool) -> Result<(), Error> {
    require_owner(env)?;
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage()
        .instance()
        .set(&DataKey::JobCreationPaused, &paused);
    Ok(())
}

