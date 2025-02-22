import { BigNumber } from 'ethers'
import BTree_ from 'sorted-btree'
const BTree = (BTree_ as any).default as typeof BTree_

import config from '../../config'
import { Logging } from '../../utils'
import { fmtAnchor, leftId, shortId } from '../../lib'
import { BlockDetails } from '../../chain'

import { Player } from './player'
import { Round } from './round'

export type StakeFreeze = {
	overlay: string
	numBlocks: BigNumber
}

export type StakeSlash = {
	overlay: string
	amount: BigNumber
}

export type Reveal = {
	owner: string
	overlay: string
	stake: BigNumber
	stakeDensity: BigNumber
	hash: string
	depth: BigNumber
}

/**
 * A singleton class for managing the state of players
 */
export class SchellingGame {
	private static instance: SchellingGame
	// All players have a unique overlay address
	private players: BTree_<string, Player>
	private rounds: BTree_<number, Round>
	private currentRoundNo = 0
	private lastBlock: BlockDetails

	private myOverlays: string[] = []
	private myAccounts: string[] = []

	private static _showLogs = false

	/**
	 * Make the constructor private so that it can't be called.
	 * @private
	 */
	private constructor() {
		this.players = new BTree()
		this.rounds = new BTree()
		this.currentRoundNo = 0 // We haven't started the game yet
		this.lastBlock = { blockNo: 0, blockTimestamp: 0 }
	}

	private getOrCreatePlayer(
		overlay: string,
		account?: string,
		block?: BlockDetails
	): Player {
		if (!this.players.has(overlay)) {
			this.players.set(overlay, new Player(overlay, account, block))
		} else {
			// See if we need to learn an account for an overlay
			const player = this.players.get(overlay)!
			if (!player.account && account) {
				player.setAccount(account)
				if (this.myOverlays.includes(overlay)) {
					// If it is highlighted, highlight the account as well
					this.myAccounts[this.myAccounts.length] = account
				}
			}
		}
		return this.players.get(overlay)!
	}

	public getOrCreateRound(roundNo: number, block: BlockDetails): Round {
		// create the round if it doesn't exist
		if (!this.rounds.has(roundNo)) {
			console.log(block.blockNo, roundNo, 'Round Start')
			this.players.forEachPair((overlay, player) => {
				player.notPlaying()
			})
			this.rounds.set(roundNo, new Round(block))
		}
		const round = this.rounds.get(roundNo)
		return round!
	}

	public highlightOverlay(overlay: string) {
		if (!this.myOverlays.includes(overlay)) {
			this.myOverlays[this.myOverlays.length] = overlay
			this.getOrCreatePlayer(overlay)
		}
	}

	// --- game logic ---

	public newBlock(block: BlockDetails, roundAnchor?: string) {
		const roundNo = SchellingGame.roundFromBlockNo(block.blockNo)
		if (roundNo != this.currentRoundNo) {
			// When the round changes, by defintion, no one is playing
			if (this.currentRoundNo != 0) {
				const round = this.rounds.get(this.currentRoundNo)
				if (round) {
					for (const player of round.players) {
						this.players.get(player)?.notPlaying() // Previous round's players are no longer playing
					}
					if (!round.claim) {
						round.lastBlock = this.lastBlock
						round.unclaimed = true
						console.log(block.blockNo, round.id, 'Round not claimed')
					}
				} else
					Logging.showLogError(
						`Previous round ${this.currentRoundNo} Not found?`
					)
			}
			this.currentRoundNo = roundNo
		}

		const round = this.getOrCreateRound(roundNo, block)
		this.lastBlock = block
		const blocksPerRound = config.game.blocksPerRound // TODO use configured blocksPerRound
		const offset = block.blockNo % blocksPerRound
		const leftInRound = config.game.blocksPerRound - offset - 1
		let phase
		let length
		let elapsed
		if (offset < blocksPerRound / 4) {
			phase = 'commit'
			length = blocksPerRound / 4
			elapsed = offset + 1
			round.setAnchor(roundAnchor)
		} else if (offset < blocksPerRound / 2) {
			phase = 'reveal'
			length = blocksPerRound / 4
			elapsed = offset - blocksPerRound / 4 + 1
			round.setAnchor(roundAnchor)
		} else {
			phase = 'claim'
			length = blocksPerRound / 2
			elapsed = offset - blocksPerRound / 2 + 1
		}
	}

	// --- commit
	public commit(overlay: string, owner: string, block: BlockDetails) {
		const roundNo = SchellingGame.roundFromBlockNo(block.blockNo)

		const round = this.getOrCreateRound(roundNo, block)
		round!.lastBlock = block

		// update player state
		const player = this.getOrCreatePlayer(overlay, owner, block)!
		player.commit(block)

		// update the round state
		round.commits++
		round.players.push(overlay)

		if (SchellingGame._showLogs)
			Logging.showError(
				`${Round.roundString(block.blockNo)} Player ${leftId(overlay, 16)}`
			)
	}

	// --- reveal
	public reveal(
		overlay: string,
		owner: string,
		hash: string,
		depth: number,
		block: BlockDetails
	) {
		const roundNo = SchellingGame.roundFromBlockNo(block.blockNo)

		const round = this.getOrCreateRound(roundNo, block)
		round!.lastBlock = block

		// update the player
		const player = this.getOrCreatePlayer(overlay, owner, block)!
		player.reveal(block, roundNo, hash, depth)

		// update the round state
		round.reveals++

		if (round.hashes[hash]) {
			if (round.hashes[hash].depth != depth) {
				Logging.showLogError(
					`reveal: hash ${hash} has different depth ${round.hashes[hash].depth} != ${depth}`
				)
				return
			}

			round.hashes[hash].count++
			if (this.isMyOverlay(overlay)) round.hashes[hash].highlight = true
		} else {
			round.hashes[hash] = {
				count: 1,
				depth,
				highlight: this.isMyOverlay(overlay),
			}
			if (SchellingGame._showLogs)
				Logging.showError(
					`${Round.roundString(block.blockNo)} new hash ${shortId(hash, 16)}`
				)
		}

		if (SchellingGame._showLogs)
			Logging.showError(
				`${Round.roundString(block.blockNo)} Player ${leftId(
					overlay,
					16
				)} reveal ${depth} ${shortId(hash, 16)}`
			)
	}

	// --- claim
	public claim(
		winner: Reveal,
		owner: string,
		amount: BigNumber,
		block: BlockDetails,
		freezes: StakeFreeze[] = [],
		slashes: StakeSlash[] = []
	) {
		const roundNo = SchellingGame.roundFromBlockNo(block.blockNo)

		const round = this.getOrCreateRound(roundNo, block)
		round!.lastBlock = block

		// update player state
		const winningPlayer = this.getOrCreatePlayer(winner.overlay, owner, block)!
		winningPlayer.claim(block, amount)

		// freeze any players
		freezes.forEach(({ overlay, numBlocks }) => {
			const player = this.players.get(overlay)
			if (player) {
				player.freeze(block, numBlocks.add(block.blockNo).toNumber())
			}
		})

		// slash any players
		slashes.forEach(({ overlay, amount: wad }) => {
			const player = this.players.get(overlay)
			if (player) {
				player.slash(block, wad)
			}
		})

		round.claim = {
			overlay: winner.overlay,
			amount,
			depth: winner.depth,
			truth: winner.hash,
		}
		round.freezes = freezes.length
		round.slashes = slashes.length

		if (SchellingGame._showLogs)
			Logging.showError(
				`${Round.roundString(block.blockNo)} Player ${leftId(
					winner.overlay,
					16
				)} claim ${winner.depth} ${shortId(winner.hash, 16)}`
			)
	}

	// --- stake logic (slashing and freezing handled in claim)

	// --- stake updated (depositStake)
	public stakeUpdated(
		overlay: string,
		owner: string,
		amount: BigNumber,
		block: BlockDetails
	) {
		// update player state
		const player = this.getOrCreatePlayer(overlay, owner, block)
		player.updateStake(block, amount)
	}

	public stakeSlashed(overlay: string, amount: BigNumber, block: BlockDetails) {
		// update player state
		const player = this.getOrCreatePlayer(overlay, undefined, block)
		player.slash(block, amount)
	}

	// --- singleton method

	public static getInstance(): SchellingGame {
		if (!SchellingGame.instance) {
			SchellingGame.instance = new SchellingGame()
		}
		return SchellingGame.instance
	}

	// --- accessors

	/**
	 * Get the total number of players.
	 * @returns {number} The total number of players.
	 */
	public get size(): number {
		return this.players.size
	}

	/**
	 * Get all the players.
	 * @returns {IterableIterator[]} All the players.
	 */
	public get values(): IterableIterator<Player> {
		return this.players.values()
	}

	/**
	 * Get all the player's overlay addresses
	 * @returns {string[]} the player's overlay addresses
	 */
	public get keys(): IterableIterator<string> {
		return this.players.keys()
	}

	public get numRounds(): number {
		return this.rounds.size
	}

	public getRound(round: number) {
		return this.rounds.get(round)
	}

	public getPlayer(overlay: string) {
		return this.players.get(overlay)
	}

	// --- booleans

	/**
	 * Determine if the overlay address is in the list of my overlays
	 * @param overlay the overlay address to check
	 * @returns true if the overlay address is in the list of my overlays
	 */
	public isMyOverlay(overlay: string): boolean {
		return this.myOverlays.includes(overlay)
	}

	/**
	 * Determine if the account is in the list of my accounts
	 * @param account the account to check
	 * @returns true if the account is in the list of my accounts
	 */
	public isMyAccount(account: string): boolean {
		return this.myAccounts.includes(account)
	}

	// --- static helpers

	/**
	 * Determine the rond from the block number
	 * @param blockNo from which to calculate the round
	 * @returns the round number
	 */
	public static roundFromBlockNo(blockNo: number): number {
		return Math.floor(blockNo / config.game.blocksPerRound)
	}
}
