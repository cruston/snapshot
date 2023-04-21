//const config = require('./config.json')
const utils = require('../../eth/utils')
const fs = require("fs")

const { ethers } = require('ethers')
const axios = require("axios")

const provider = new ethers.providers.JsonRpcProvider(utils.MATIC_RPC)


//
async function send_vote_request(data, alias) {
  const config = {
    method: 'post',
    url: 'https://hub.snapshot.org/api/msg',
    headers: {
      'authority': 'hub.snapshot.org',
      'accept': 'application/json',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'content-type': 'application/json',
      'origin': 'https://snapshot.org',
      'referer': 'https://snapshot.org/',
      'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36'
    },
    data: JSON.stringify(data)
  };

  try {
    console.log(`\n${data.address}:${alias} send voting request ...`)
    const res = await axios(config)
    if (res.data.id) {
      console.log(`${data.address}:${alias} vote ok`);
    }
  } catch (error) {
    console.log(`${data.address} vote failed`, JSON.stringify(error.response.data));
  }
}

async function get_signature(signer, signData) {
  const { domain, types, message } = signData.data
  
  return await signer._signTypedData(domain, types, message)
}

async function vote(signer, space, proposal, choice, alias) {
  
  let choice_type = "uint32";
  if (Array.isArray(choice)) choice_type = "uint32[]";

  const data = {
    "address": signer.address,
    "data": {
      "domain": {
        "name": "snapshot",
        "version": "0.1.4"
      },
      "types": {
        "Vote": [
          {
            "name": "from",
            "type": "address"
          },
          {
            "name": "space",
            "type": "string"
          },
          {
            "name": "timestamp",
            "type": "uint64"
          },
          {
            "name": "proposal",
            "type": "string"
          },
          {
            "name": "choice",
            "type": choice_type
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "app",
            "type": "string"
          }
        ]
      },
      "message": {
        "space": space,
        "proposal": proposal,
        "choice": choice,
        "app": "snapshot",
        "reason": "",
        "from": signer.address,
        "timestamp": Math.floor(Date.now() / 1000)
      }
    }
  }

  data.sig = await get_signature(signer, data)
  //console.log(data)
  
  await send_vote_request(data, alias)
}

async function get_votes(address, proposal) {
  let data = {
    "operationName": "Votes",
    "variables": {
      "first": 10, 
      "skip": 0, 
      "voter": address
    },
    "query": "query Votes($voter: String!, $first: Int, $skip: Int, $orderBy: String, $orderDirection: OrderDirection) {\n  votes(\n    first: $first\n    skip: $skip\n    where: {voter: $voter}\n    orderBy: $orderBy\n    orderDirection: $orderDirection\n  ) {\n    id\n    created\n    choice\n    proposal {\n      id\n      title\n      choices\n      type\n    }\n    space {\n      id\n      avatar\n    }\n  }\n}"
  }

  const config = {
    method: 'post',
    url: 'https://hub.snapshot.org/graphql',
    data: data
  }

  try {
    const res = await axios(config)
    //console.log(res.data.data.votes)
    for (let vote of res.data.data.votes) {
      if (vote.proposal.id == proposal) return true
    }

    return false
  } catch (error) {
    console.log(`get votes failed`, JSON.stringify(error.response.data))

    return false
  }

}

async function main() {
  
  let fn = process.argv[2]
  if (fn == undefined) return

  let config = JSON.parse(fs.readFileSync(fn).toString())
  console.log(`voting on ${config.space}, proposal: ${config.proposal}, choice: ${config.choice}`)

  let sec = require('prompt-sync')()('hi -> ', {echo:'*'})
  let arr = sec.split('')
  if (arr.length != 16) return

  let alias = config.accounts.split(',')

  let a = []
  while (a.length < alias.length) {
  //for (let alias of config.accounts.split(',')) {
    let r = Math.floor(Math.random() * alias.length)
    if (a.includes(r)) continue
    a.push(r)
    let private_key = get_private_key(alias[r].trim(), arr)
    if (private_key == undefined) continue
    
    let signer = new ethers.Wallet(private_key, provider)
    
    if (await get_votes(signer.address, config.proposal)) {
      console.log(`\n${alias[r]} has voted on proposal ${config.proposal}`)
      continue
    }

    await vote(signer, config.space, config.proposal, config.choice, alias[r])

    await utils.sleep(7500 + Math.floor(Math.random(1) * 6000))

    //break
  }
}

main()