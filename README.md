# Intro

Export Storage Incentives (SI) events for the Ethersphere Bee swarm to a postgres database. Written in Typescript for node.js

## Prerequisites

node v18 or higher

Then install libraries with ```npm install```.

### Running

First create a dbconfig.ts file in src with the following:

```typescript
export const DbConfig = {
    "host":"<hostname>",
    "user":"<username>",
    "password":"<password>",
    'database':"swarm"
}
```
Then create the database and tables:
TODO

Then run it with:

```bash
node --experimental-specifier-resolution=node --loader=ts-node/esm ./src/index.ts --rpc-endpoint ws://<YourRPCIP:port>
```

### Extending / developing this

If you're developing and want to build / extend on this feel free! You may submit pull requests and issues but they will mosty likely be ignored, I hacked this together for fun and my own personal use and do not have the time or inclicantion to maintain or support a project.


## Acknowledgements

monsi was originally written by @ldeffenb and was heavily based on monBee. @mfw78 graciously offered to restructure the original grungy monolithic code into something much more understandable, extendible, and maintainable. The result of this collaboration is the monsi that you see here.

## Warning

Just don't run monsi for a long time if you use infura.io's (or any other provider's) free account because monsi monitors every single block and will eat up your 100,000 API hits in short order. No gETH, but every query is counted at infura.io, and monsi does LOTS of blockchain queries!

Having your own local RPC provider is **strongly** recommended!
