const { decode,
  getRegistryBase,
  getSpecTypes,
  TypeRegistry,
} = require('@substrate/txwrapper-core');
// const { GenericExtrinsicPayload, GenericCall } = require('@polkadot/types');

const PolkadotSS58Format = {
  polkadot: 0,
  kusama: 2,
  westend: 42,
  substrate: 42,
};

const KNOWN_CHAIN_PROPERTIES = {
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

function getRegistry({
  specName,
  chainName,
  specVersion,
  metadataRpc,
  properties,
}) {
  // The default type registry has polkadot types
  const registry = new TypeRegistry();
  
  // As of now statemine is not a supported specName in the default polkadot-js/api type registry.
  const chainNameAdjusted = chainName === 'Statemine' ? 'Statemint' : chainName;
  const specNameAdjusted = specName === 'statemine' ? 'statemint' : specName;
  
  return getRegistryBase({
    chainProperties: properties || KNOWN_CHAIN_PROPERTIES[specName],
    specTypes: getSpecTypes(
      registry,
      chainNameAdjusted,
      specNameAdjusted,
      specVersion
    ),
    metadataRpc,
  });
}

const { App } = require('@tinyhttp/app');
const axios = require('axios').default;
const fs = require('fs');

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

async function decodePayload({ signingPayload, metadata, chain }) {
  let chainName = !chain ? 'Polkadot' : (chain.charAt(0).toUpperCase() + chain.slice(1));

  let metadataRpc = '';
  if (metadata && parseInt(metadata) != NaN) {
    try {
      metadataRpc = fs.readFileSync(`./metadata/${chainName.toLowerCase()}/v${metadata}.raw`).toString().trim();
    } catch (error) {
      //
    }
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

  const registry = getRegistry({
    chainName,
    specName: chainName.toLowerCase(),
    metadataRpc,
  });

  // const { method } = GenericExtrinsicPayload.decodeExtrinsicPayload(registry, signingPayload, 4);
  // const call = new GenericCall(registry, method, registry.metadata);
  // console.log(call.toHuman());

  const { metadataRpc: _tmp, ...decoded } = decode(signingPayload, { metadataRpc, registry });

  return decoded;
}
