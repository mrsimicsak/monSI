import { BigNumber } from 'ethers'
import { Logging } from '../../utils'
import config from '../../config'
import { BlockDetails } from '../../chain'
import { fmtOverlay, shortBZZ } from '../../lib'
import { Round } from './round'

export class Player {
	private _overlay: string // overlay of the bee node
	private _account: string | undefined // ethereum address of the bee node
	private amount: BigNumber = BigNumber.from(0) // total amount won / lost
	private stake?: BigNumber // Total stake (if tracking)
	private stakeSlashed?: BigNumber // Total stake slashed (if tracking)
	private stakeChangeCount = 0
	private _isPlaying = false
	private lastBlock: BlockDetails | undefined // block details of last interaction
	private lastAction: string | undefined // tracks last action which cannot be derived from blockNumber
	private playCount?: number // don't initialize
	private winCount = 0 // initialize as 0
	private frozenThawBlock?: number // if true, this is a frozen overlay
	private freezeCount = 0 // initialize as 0
	private slashCount = 0 // initialize as 0

	private reveals: { [round: number]: { hash: string; depth: number } } = {}

	public get overlay() {
		return this._overlay
	}
	public get account() {
		return this._account
	}

	public setAccount(account: string) {
		this._account = account
	}

	public notPlaying() {
		if (this._isPlaying) {
			// Saves a render() if it isn't changing
			this._isPlaying = false
		}
	}

	/**
	 * Create a new Player object
	 * @param overlay address of the bee node (swarm overlay)
	 * @param account ethereum address of the bee node
	 */
	constructor(
		overlay: string,
		account: string | undefined,
		_block: BlockDetails | undefined
	) {
		this._overlay = overlay
		this._account = account
		this.lastBlock = _block
	}

	/**
	 * Format the overlay address as a string
	 * @returns the overlay address as a string
	 */
	overlayString(): string {
		return fmtOverlay(this._overlay, 12)
	}

	/**
	 * Bump the player's play count
	 * @param blockTime the block time in milliseconds
	 */
	commit(block: BlockDetails) {
		this.lastBlock = block
		this.lastAction = 'commit'
		this._isPlaying = true
		this.playCount = (this.playCount || 0) + 1

		// if the player is frozen, check if they should be thawed
		if (this.frozenThawBlock) {
			this.frozenThawBlock = undefined
		}
	}

	reveal(block: BlockDetails, round: number, hash: string, depth: number) {
		this.lastBlock = block
		this.lastAction = 'reveal'
		this._isPlaying = true
		this.reveals[round] = { hash, depth }
	}

	/**
	 * As a winner, claim our prize
	 * @param block the block time in milliseconds
	 * @param _amount the amount to add to the player's total amount
	 */
	claim(block: BlockDetails, _amount: BigNumber) {
		this.lastBlock = block
		this.lastAction = 'claim'
		this._isPlaying = true
		this.amount = this.amount.add(_amount)
		this.winCount++
	}

	/**
	 * Freeze the player's stake
	 * @param block the block time in milliseconds
	 * @param thawBlock the block number when the player will be thawed
	 */
	freeze(block: BlockDetails, thawBlock: number) {
		this.lastBlock = block
		this.lastAction = 'freeze'
		this.frozenThawBlock = thawBlock
		this.freezeCount++
		const elapsed = thawBlock - block.blockNo

		Logging.showError(
			`${this.overlayString()} {blue-fg}Frozen{/blue-fg} for ${elapsed} blocks or ${
				elapsed / config.game.blocksPerRound
			} rounds @${block.blockNo}`
		)
	}

	updateStake(block: BlockDetails, amount: BigNumber) {
		this.lastBlock = block
		this.lastAction = 'stake'

		// don't set the below as the amount is only used to track winnings
		// this.amount = amount

		this.stake = amount
		this.stakeChangeCount++

		Logging.showError(
			`${this.overlayString()} Stake Updated ${shortBZZ(amount)} now ${shortBZZ(
				this.stake
			)}(${this.stakeChangeCount}) @${block.blockNo}`
		)
	}

	/**
	 * Slash the player's stake
	 * @param block the block time in milliseconds
	 * @param amount the amount to subtract from the player's total stake
	 */
	slash(block: BlockDetails, amount: BigNumber) {
		this.lastBlock = block
		this.lastAction = 'slash'
		if (!this.stakeSlashed) this.stakeSlashed = BigNumber.from(0)
		if (this.stake) {
			if (this.stake.gte(amount)) {
				this.stake = this.stake.sub(amount)
				this.stakeSlashed = this.stakeSlashed.add(amount)
			} else {
				this.stakeSlashed = this.stakeSlashed.add(this.stake)
				this.stake = BigNumber.from(0)
			}
		} else this.stake = BigNumber.from(0)
		this.slashCount++
		this.stakeChangeCount++

		Logging.showError(
			`${this.overlayString()} {red-fg}Slashed{/red-fg} ${shortBZZ(
				amount
			)} now ${shortBZZ(this.stake)} (${
				this.stakeChangeCount
			}) {red-fg}-${shortBZZ(this.stakeSlashed)}{/red-fg} @${block.blockNo}`
		)
	}
}
