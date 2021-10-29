const { createMetadata, getSpecTypes, toTxMethod } = require('@substrate/txwrapper-core');
const { createTypeUnsafe, TypeRegistry } = require('@polkadot/types');
// const { u8aToHex, hexToU8a } = require('@polkadot/util');
// const { blake2AsU8a, blake2AsHex } = require('@polkadot/util-crypto');
// const { GenericExtrinsicPayload, GenericCall } = require('@polkadot/types');

const PolkadotSS58Format = {
  polkadot: 0,
  kusama: 2,
  westend: 42,
  substrate: 42,
};

const KNOWN_CHAIN_PROPERTIES = {
  westend: {
    ss58Format: PolkadotSS58Format.westend,
    tokenDecimals: 12,
    tokenSymbol: 'WND',
  },
  kusama: {
    ss58Format: PolkadotSS58Format.kusama,
    tokenDecimals: 12,
    tokenSymbol: 'KSM',
  },
  polkadot: {
    ss58Format: PolkadotSS58Format.polkadot,
    tokenDecimals: 10,
    tokenSymbol: 'DOT',
  }
};

// metadata cache
const METADATA_MAP = {
  Westend: null,
  Polkadot: null,
};

// The default type registry has polkadot types
const registry = new TypeRegistry();

// preload
(async () => {
  await Promise.all(Object.keys(METADATA_MAP).map(async (chainName) => {
    try {
      let metadataRpc = await fs.readFile(`./metadata/${chainName.toLowerCase()}/v14.raw`);
      metadataRpc = metadataRpc.toString().trim();
      METADATA_MAP[chainName] = createMetadata(registry, metadataRpc);
    } catch (error) {
      //
    }
  }));
})();

function getRegistry({
  specName,
  chainName,
  specVersion,
  metadata,
  properties,
}) {
  // As of now statemine is not a supported specName in the default polkadot-js/api type registry.
  const chainNameAdjusted = chainName === 'Statemine' ? 'Statemint' : chainName;
  const specNameAdjusted = specName === 'statemine' ? 'statemint' : specName;
  registry.register(getSpecTypes(
    registry,
    chainNameAdjusted,
    specNameAdjusted,
    specVersion
  ));

  METADATA_MAP[chainName] = metadata;
  registry.setMetadata(metadata);

  // Register the chain properties for this registry
  const chainProperties = properties || KNOWN_CHAIN_PROPERTIES[specName];
  registry.setChainProperties(registry.createType('ChainProperties', chainProperties));
  
  return registry;
}

const { App } = require('@tinyhttp/app');
const axios = require('axios').default;
const fs = require('fs').promises;

const app = new App()

app.use(require('body-parser').json())

app.post('/substrate/decode', async (req, res) => {
  try {
    const result = await decodePayload(req.body);
    res.json({ code: 0, result });
  } catch (error) {
    console.error(error);
    res.json({ code: 1, message: error.message });
  }
})

app.listen(3578)

async function decodePayload({ signingPayload, metadata: version, chain }) {
  let chainName = !chain ? 'Polkadot' : (chain.charAt(0).toUpperCase() + chain.slice(1));

  let metadata = METADATA_MAP[chainName];
  if (version && parseInt(version) != NaN) {
    if (metadata && metadata.version == version) {
      // pass through
    } else {
      metadata = null;
    }
  }

  if (!metadata) {
    let metadataRpc = null;

    try {
      metadataRpc = await fs.readFile(`./metadata/${chainName.toLowerCase()}/v${version}.raw`);
      metadataRpc = metadataRpc.toString().trim();
    } catch (error) {
      //
      console.error(error);
    }

    if (!metadataRpc) {
      const { data: { result } } = await axios.post(`https://${chainName.toLowerCase()}.api.onfinality.io/public`, {
        id: "1",
        jsonrpc: "2.0",
        method: "state_getMetadata",
        params: [],
      });
      metadataRpc = result;
    }

    metadata = createMetadata(registry, metadataRpc);
  }

  getRegistry({
    chainName,
    specName: chainName.toLowerCase(),
    metadata,
  });

  // const { method } = GenericExtrinsicPayload.decodeExtrinsicPayload(registry, signingPayload, 4);
  // const call = new GenericCall(registry, method, registry.metadata);
  // console.log(call.toHuman());

  const payload = createTypeUnsafe(registry, 'ExtrinsicPayload', [
      signingPayload,
      {
          version: 4,
      },
  ]);

  const methodCall = createTypeUnsafe(registry, 'Call', [payload.method]);
  const method = toTxMethod(registry, methodCall);

  const decoded = {
      blockHash: payload.blockHash.toHex(),
      eraPeriod: payload.era.asMortalEra.period.toNumber(),
      genesisHash: payload.genesisHash.toHex(),
      method,
      nonce: payload.nonce.toNumber(),
      specVersion: payload.specVersion.toNumber(),
      tip: payload.tip.toNumber(),
      transactionVersion: payload.transactionVersion.toNumber(),
  };
  // const { metadataRpc: _tmp, ...decoded } = decode(signingPayload, { metadataRpc, registry });
  // console.log(JSON.stringify(decoded));

  return decoded;
}
