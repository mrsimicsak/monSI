#!/usr/bin/env -S node --experimental-specifier-resolution=node

import { Command, Option, InvalidOptionArgumentError } from 'commander'
import pack from '../package.json' assert { type: 'json' }
import config from './config'

import { ChainSync } from './chain'
import { Round, SchellingGame } from './types/entities'
import { utils } from 'ethers'

import { Logging } from './utils'

import pkg from 'pg'
const { Client } = pkg

export const client = new Client(DbConfig)

import { DbConfig } from './dbconfig'

// sane defaults for the environment variables (if not set)
const DEFAULT_RPC_ENDPOINT = 'ws://localhost:8545'

interface CLIOptions {
	mainnet: boolean
	rpcEndpoint: string
	rounds?: number
	block?: number
	round?: number
	singleRound?: number
}

/**
 * Run the CLI
 * @param overlays User's overlays to highlight
 * @param options CLI options
 */
async function run(overlays: string[], options: CLIOptions) {
	const { mainnet, rpcEndpoint, rounds, block, round, singleRound } = options

	try {
		console.log('Connecting to database.')
		await client.connect()
		console.log('Sucessfully connected to database.')
	} catch (err) {
		console.log(err)
		process.exit(1)
	}

	// Set the chain ID
	config.setChainId(100)

	const chainsync = ChainSync.getInstance()

	// initialiaze ChainSync
	await chainsync.init(rpcEndpoint)

	let endBlock = await chainsync.getCurrentBlock()
	console.log('Current block is: ', endBlock)

	let startBlock

	try {
		console.log('Attempting to retrive last block from database.')
		let results = await client.query(
			`select block from public.player_action_log order by block desc limit 1`
		)

		if (results.rowCount > 0) {
			startBlock = parseInt(results.rows[0].block) + 1
			console.log('resuming from block: ', startBlock)
		} else {
			startBlock = 25527075 // mainnet staking contract creation
			console.log('No blocks found in database, starting from: ', startBlock)
		}
	} catch (err) {
		Logging.showError(`Failed to load last block from database: ${err}`)
		process.exit(1)
	}

	console.log(
		'Starting from block: ',
		startBlock,
		', ending at: ',
		endBlock,
		'. Syncing ',
		endBlock - startBlock,
		' blocks,'
	)
	let startingRound = Round.roundFromBlock(startBlock)
	let endingRound = Round.roundFromBlock(endBlock)
	console.log(
		'Starting from round: ',
		startingRound,
		', ending at: ',
		endingRound,
		', Syncing ',
		endingRound - startingRound,
		' rounds.'
	)

	// start the chain sync
	chainsync.start(startBlock)

	// start the game
	const game = SchellingGame.getInstance()

	if (overlays.length > 0) {
		for (const overlay of overlays) {
			game.highlightOverlay(overlay)
		}
	}
}

function cliParseOverlay(overlay: string, previous: string[]): string[] {
	try {
		// use ethers to validate the overlay address
		const bytes = utils.arrayify(overlay, { allowMissingPrefix: true })
		if (bytes.length != 32) {
			throw new Error('Invalid overlay length')
		} else {
			if (!previous) previous = []
			// for ensuring consistent `0x` prefix
			previous.push(utils.hexlify(bytes))
			return previous
		}
	} catch (e) {
		throw new InvalidOptionArgumentError('Not a valid overlay.')
	}
}

/**
 * CLI entry point
 */
async function main() {
	const program = new Command()

	program
		.name('monSI')
		.description('Monitor Storage Incentives for Swarm')
		.version(pack.version)
		.argument(
			'[overlays...]',
			'Overlay addresses for highlighting',
			cliParseOverlay
		)
		.addOption(
			new Option(
				'--rpc-endpoint <string>',
				'RPC endpoint for the blockchain node'
			)
				.env('RPC_URL')
				.default(DEFAULT_RPC_ENDPOINT)
		)
		.action(run)

	await program.parseAsync(process.argv)
}

main()
