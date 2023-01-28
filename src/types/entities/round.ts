import { BigNumber, BigNumberish } from 'ethers'
import { Logging } from '../../utils'
import { BlockDetails } from '../../chain'
import config from '../../config'
import { fmtAnchor, fmtOverlay, shortBZZ } from '../../lib'
import { SchellingGame } from './schelling'

export type RoundHash = {
	depth: number
	count: number
	highlight: boolean
}

export type Claim = {
	overlay: string
	truth: string
	depth: BigNumberish
	amount: BigNumber
}

export class Round {
	private _id: number
	private _anchor: string | undefined = undefined
	public lastBlock: BlockDetails
	public commits = 0
	public reveals = 0
	public slashes = 0
	public freezes = 0
	public players: string[] = []
	public hashes: { [hash: string]: RoundHash } = {}
	public claim: Claim | undefined = undefined
	public unclaimed = false

	public get id() {
		return this._id
	}

	public get anchor() {
		return this._anchor
	}

	public setAnchor(anchor?: string) {
		if (anchor) {
			if (this._anchor && this._anchor != anchor) {
				Logging.showLogError(
					`round ${this._id} anchor change from ${fmtAnchor(
						this._anchor
					)} to ${fmtAnchor(anchor)}`
				)
			}
			if (this._anchor != anchor) {
				this._anchor = anchor
			}
		}
	}

	constructor(block: BlockDetails) {
		this._id = Round.roundFromBlock(block.blockNo)
		this.lastBlock = block
	}

	public roundString(): string {
		return Round.roundString(this.lastBlock.blockNo)
	}

	public static roundFromBlock(block: number) {
		return Math.floor(block / config.game.blocksPerRound)
	}

	public static roundString(block: number) {
		return `${Round.roundFromBlock(block)}(${
			block % config.game.blocksPerRound
		})`
	}

	public static roundPhaseFromBlock(block: number) {
		const residual = block % config.game.blocksPerRound

		if (residual < config.game.commitPhaseBlocks) {
			return 'commit'
		} else if (
			residual <
			config.game.commitPhaseBlocks + config.game.revealPhaseBlocks
		) {
			return 'reveal'
		} else {
			return 'claim'
		}
	}
}
