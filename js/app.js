var DEBUG_DASH_AIRDROP = {};

$(function () {
  'use strict';

  var bitcore = require('bitcore-lib-dash');

  var exampleCsv = [
    '# = 4'
  , '"XjSBXfiAUdrGDJ8TYzSBc2Z5tjexAZao4Q", "7reAg9R74ujxxSj34jpbRpPhfsPt9ytAh3acMehhs1CmfoGFHbh"'
  , '"XunE8skypFR3MHAbu2S3vBZWrWStzQE9f7", "7s8YEQ8LPcCBcWajnwoRYqxCXo5W4AwFrftxQfzoomFGvqYTf8Z"'
  , '"XyGDB8JJhR2s7smACWdWDEV1Lgkg2YeZvH", "7rC9qypu87UCbaDDmAeGGK3JS1TYjLNtT97Nse1E1m7CQaMQSPY"'
  , '"Xsnn4AkwnRDPK3i4CC4MpnhGWcvBKM6bVG", "7qjqyQC7NYWbmRbCq1QfCa3PHZzECjos97WpX3KwWRBc2rxxjcQ"'
  ].join('\n');
  var exampleCsv2 = [
    '1,"XjSBXfiAUdrGDJ8TYzSBc2Z5tjexAZao4Q","7reAg9R74ujxxSj34jpbRpPhfsPt9ytAh3acMehhs1CmfoGFHbh"'
  , '2,"XunE8skypFR3MHAbu2S3vBZWrWStzQE9f7","7s8YEQ8LPcCBcWajnwoRYqxCXo5W4AwFrftxQfzoomFGvqYTf8Z"'
  , '3,"XyGDB8JJhR2s7smACWdWDEV1Lgkg2YeZvH","7rC9qypu87UCbaDDmAeGGK3JS1TYjLNtT97Nse1E1m7CQaMQSPY"'
  , '4,"Xsnn4AkwnRDPK3i4CC4MpnhGWcvBKM6bVG","7qjqyQC7NYWbmRbCq1QfCa3PHZzECjos97WpX3KwWRBc2rxxjcQ"'
  ];

  var config = {
    insightBaseUrl: 'https://api.dashdrop.coolaj86.com/insight-api-dash'
  , walletQuantity: 100
  , transactionFee: 1000 // 1000 // 0 seems to give the "insufficient priority" error
  , walletAmount: 10000
  , serialize: { disableDustOutputs: true, disableSmallFees: true }
    // mdash per dash = 1000
    // udash per dash = 1000000
    // satoshis per dash = 100000000
  , dashMultiple: 1000000
  , SATOSHIS_PER_DASH: 100000000
  , outputsPerTransaction: 1000 // theroetically 1900 (100kb transaction)
  };

  var data = {
    keypairs: []
  , claimableMap: {}
  , claimable: []
  };

  var DashDrop = {};
  DashDrop._privateToPublic = function (sk) {
    return new bitcore.PrivateKey(sk).toAddress().toString();
  };
  DashDrop._keypairToPublicKey = function (sk) {
    return sk.publicKey; //new bitcore.PrivateKey(sk).toAddress().toString();
  };
  // opts = { utxo, src, dsts, amount, fee }
  DashDrop.estimateFee = function (opts) {
    var tx = new bitcore.Transaction();

    opts.dsts.forEach(function (publicKey) {
      tx.to(new bitcore.Address(publicKey), opts.amount);
    });
    tx.change(new bitcore.PrivateKey(opts.src).toAddress());
    opts.utxos.forEach(function (utxo) {
      tx.from(utxo);
    });

    return tx.getFee();
  };
  DashDrop.disburse = function (opts) {
    var tx = new bitcore.Transaction();

    opts.dsts.forEach(function (publicKey) {
      tx.to(new bitcore.Address(publicKey), opts.amount);
    });
    tx.change(new bitcore.PrivateKey(opts.src).toAddress());
    opts.utxos.forEach(function (utxo) {
      tx.from(utxo);
    });
    if ('undefined' !== typeof opts.fee) {
      tx.fee(opts.fee);
    }
    return tx.sign(new bitcore.PrivateKey(opts.src)).serialize({ disableDustOutputs: true, disableSmallFees: true });
  };

  // opts = { utxos, srcs, dst, fee }
  DashDrop.claim = function (opts) {
    var tx = new bitcore.Transaction();
    var addr;
    var sum = 0;
    var total;

    opts.utxos.forEach(function (utxo) {
      sum += utxo.satoshis;
      tx.from(utxo);
    });
    total = sum;

    if ('undefined' !== typeof opts.fee) {
      if (opts.utxos.length > 1) {
        // I'm not actually sure what the fee schedule is, but this worked for me
        opts.fee = Math.max(opts.fee, 2000);
      }
      sum -= (opts.fee);
      tx.fee(opts.fee);
    }

    if (52 === opts.dst.length || 51 === opts.dst.length) {
      addr = new bitcore.PrivateKey(opts.dst).toAddress();
    } else if (34 === opts.dst.length) {
      addr = new bitcore.Address(opts.dst);
    } else {
      throw new Error('unexpected key format');
    }
    //tx.to(addr);
    tx.change(addr);

    opts.srcs.forEach(function (sk) {
      tx.sign(new bitcore.PrivateKey(sk));
    });

    return tx.serialize({ disableDustOutputs: true, disableSmallFees: true });
  };

  var DashDom = {};
  DashDom.views = {};
  DashDom._hasBalance = function (pk) {
    try {
      return JSON.parse(localStorage.getItem('dash:' + (pk.publicKey || pk.privateKey))).amount;
    } catch(e) {
      return parseInt(localStorage.getItem('dash:' + (pk.publicKey || pk.privateKey)), 10);
    }
  };


  //
  // Insight Base URL
  //
  DashDom.updateInsightBase = function () {
    config.insightBaseUrl = $('.js-insight-base').val().replace(/\/+$/, '');
    //$('.js-insight-base').text(config.insightBaseUrl);
  };

  //
  // Generate Wallets
  //
  DashDrop._keyToKeypair = function (key, obj) {
    obj = obj || {};
    if (34 === key.length) {
      obj.publicKey = key;
    } else if (52 === key.length || 51 === key.length) {
      obj.privateKey = key;
      obj.publicKey = DashDrop._privateToPublic(key);
    } else {
      return null;
    }

    return obj;
  };
  DashDom._getWallets = function () {
    var i;
    var len = localStorage.length;
    var key;
    var wallets = [];
    var dashkey;
    var keypair;

    for (i = 0; i < len; i += 1) {
      key = localStorage.key(i);
      if (!/^dash:/.test(key)) {
        continue;
        //return;
      }

      try {
        keypair = JSON.parse(localStorage.getItem(key));
        if (!isNaN(keypair)) {
          keypair = { amount: keypair };
        }
      } catch(e) {
        keypair = { amount: parseInt(localStorage.getItem(key), 10) || 0 };
      }

      dashkey = key.replace(/^dash:/, '');

      if (!keypair || !keypair.publicKey) {
        keypair = DashDrop._keyToKeypair(dashkey, keypair);
      }

      if (!keypair) {
        console.warn("Not a valid cached key:", dashkey, localStorage.getItem(key));
        continue;
        //return;
      }

      wallets.push(keypair);
    }

    return wallets;
  };
  DashDom._toCsv = function (keypairs) {
    var csv = ''; //'# = ' + keypairs.length;
    csv += keypairs.map(function (keypair, i) {
      return (i + 1) + ','
        + JSON.stringify(keypair.publicKey) + ','
        + (JSON.stringify(keypair.privateKey) || '')
        + ',' + (keypair.amount || 0)
        ;
    }).join("\n");
    return csv;
  };
  DashDom.generateWallets = function () {
    console.log("generateWallets:");
    data.keypairs = DashDom._getWallets().filter(function (keypair) {
      if (keypair.privateKey && !keypair.amount) { return true; }
    });
    config.walletQuantity = $('.js-paper-wallet-quantity').val();
    var i;
    var bitkey;

    //data.privateKeys
    for (i = data.keypairs.length; i < config.walletQuantity; i += 1) {
      bitkey = new bitcore.PrivateKey();
      data.keypairs.push({
        privateKey: bitkey.toWIF()
      , publicKey: bitkey.toAddress().toString()
      , amount: 0
      });
    }
    data.keypairs = data.keypairs.slice(0, config.walletQuantity);
    data.csv = DashDom._toCsv(data.keypairs);

    console.log('toCsv:', data.csv);
    $('.js-paper-wallet-keys').val(data.csv);
    $('.js-paper-wallet-keys').text(data.csv);

    config.transactionFee = DashDom.estimateFee(config, data);
    DashDom.updateTransactionTotal();
  };
  DashDom._debounceWq
  DashDom.updateWalletQuantity = function () {
    DashDom._debounceWq = setTimeout(function () {
      var quantity = parseInt($('.js-paper-wallet-quantity').val(), 10);
      if (quantity > config.outputsPerTransaction) {
        window.alert("Only " + config.outputsPerTransaction + " wallets can be generated at a time");
        quantity = config.outputsPerTransaction;
        $('.js-paper-wallet-quantity').val(quantity);
      }
      if (config.walletQuantity && config.walletQuantity === quantity) {
        return true;
      }
      config.walletQuantity = quantity;

      $('.js-paper-wallet-quantity').text(quantity);

      clearTimeout(DashDom._debounceWq);
        //DashDom.updateTransactionTotal();
        DashDom.generateWallets();
    }, 300);
    return true;
  };
  DashDom.updateWalletCsv = function () {
    var walletCsv = $('.js-paper-wallet-keys').val().trim();
    if (data._walletCsv && data._walletCsv === walletCsv) {
      return true;
    }
    data._walletCsv = walletCsv;
    console.log('walletCsv:', data._walletCsv);

    data.publicKeysMap = {};

    data.keypairs = data._walletCsv.split(/[,\n\r\s]+/mg).map(function (key) {
      var kp;
      key = key.replace(/["']/g, '');
      kp = DashDrop._keyToKeypair(key);
      if (!kp) {
        return null;
      }
      if (data.publicKeysMap[kp.publicKey]) {
        if (!data.publicKeysMap[kp.publicKey].privateKey) {
          data.publicKeysMap[kp.publicKey].privateKey = kp.privateKey;
        }
        return null;
      }

      data.publicKeysMap[kp.publicKey] = kp;
      return kp;
    }).filter(Boolean);

    data.keypairs.forEach(function (kp) {
      var val = localStorage.getItem('dash:' + kp.publicKey);
      if (val) {
        data.publicKeysMap[kp.publicKey].amount = val.amount || Number(val) || 0;
      }
    });
    data.csv = DashDom._toCsv(data.keypairs);

    $('.js-paper-wallet-keys').val(data.csv);
    $('.js-paper-wallet-keys').text(data.csv);

    config.walletQuantity = data.keypairs.length;
    $('.js-paper-wallet-quantity').val(data.keypairs.length);
    $('.js-paper-wallet-quantity').text(data.keypairs.length);
  };


  //
  // Load Private Wallet
  //
  DashDom.updateTransactionTotal = function () {
    console.log('update transaction total', config.walletQuantity);
    // TODO you can only have one transaction per UTXO
    config.transactionCount = Math.ceil(config.walletQuantity / config.outputsPerTransaction);
    config.estimatedTransactionFee = DashDom.estimateFee(config, data);
    config.transactionTotal = (config.transactionCount * config.transactionFee)
      + (config.walletAmount * config.walletQuantity);
    $('.js-transaction-fee').val(config.transactionFee);
    $('.js-transaction-fee').text(config.transactionFee);
    $('.js-transaction-count').val(config.transactionCount);
    $('.js-transaction-count').text(config.transactionCount);
    $('.js-transaction-total').val(config.transactionTotal);
    $('.js-transaction-total').text(config.transactionTotal);
    if (data.fundingKey && config.transactionTotal <= data.fundingTotal) {
      $('.js-transaction-commit-error').addClass('hidden');
      $('button.js-transaction-commit').prop('disabled', false);
    } else {
      $('.js-transaction-commit-error').removeClass('hidden');
      $('button.js-transaction-commit').prop('disabled', true);
    }
  };
  DashDom.updateFundingKey = function () {
    data.fundingKey = $('.js-funding-key').val();
    //localStorage.setItem('private-key', data.wif);
    var addr = new bitcore.PrivateKey(data.fundingKey).toAddress().toString();

    var url = config.insightBaseUrl + '/addrs/:addrs/utxo'.replace(':addrs', addr);
    return window.fetch(url, { mode: 'cors' }).then(function (resp) {
      return resp.json().then(function (arr) {
        var cont;
        data.fundingTotal = 0;
        data.fundingUtxos = arr;
        arr.forEach(function (utxo) {
          if (utxo.confirmations >= 6) {
            data.fundingTotal += utxo.satoshis;
          } else {
            if (false === cont) {
              return;
            }
            if (true !== cont) {
              cont = window.confirm("Funding source has not had 6 confirmations yet. Continue?")
            }
            if (true === cont) {
              data.fundingTotal += utxo.satoshis;
            }
          }
        });

        var txOpts = {
          src: data.fundingKey
        , dsts: data.keypairs.map(function (kp) { return kp.publicKey })
        , amount: config.walletAmount
        , utxos: data.fundingUtxos
        };
        config.transactionFee = DashDrop.estimateFee(txOpts);

        $('.js-transaction-fee').val(config.transactionFee);
        $('.js-transaction-fee').text(config.transactionFee);

        $('.js-funding-amount').val(data.fundingTotal);
        $('.js-funding-amount').text(data.fundingTotal);

        DashDom.updateWalletAmount();
      });
    });
  };
  DashDom.estimateFee = function () {
    var bitkey = new bitcore.PrivateKey();
    var txOpts = {
      src: bitkey.toWIF()
    , dsts: data.keypairs.map(function (kp) { return kp.publicKey })
    , amount: config.walletAmount
      // some made-up address with infinite money
    , utxos: data.fundingUtxos || [{"address":"XwZ3CBB97JnyYi17tQdzFDhZJYCenwtMU8","txid":"af37fad079c34a8ac62a32496485f2f8815ddd8fd1d5ffec84f820a91d82a7fc","vout":2,"scriptPubKey":"76a914e4e0cc1758622358f04c7d4d6894201c7ca3a44788ac","amount":8601,"satoshis":860100000000,"height":791049,"confirmations":6}]
    };
    return DashDrop.estimateFee(txOpts);
  };
  DashDom.updateWalletAmount = function () {
    var walletAmount = parseInt($('.js-paper-wallet-amount').val(), 10);

    if (!config.walletAmount && !walletAmount) {
      config.walletAmount = Math.floor(
        (data.fundingTotal - (config.transactionCount * config.transactionFee)) / config.walletQuantity
      );
      $('.js-paper-wallet-amount').val(config.walletAmount);
      $('.js-paper-wallet-amount').text(config.walletAmount);
    }

    if (!walletAmount || (config.walletAmount && config.walletAmount === walletAmount)) {
      return true;
    }

    config.walletAmount = walletAmount;
    DashDom.updateTransactionTotal();
  };
  DashDom.commitDisburse = function () {
    // The logic here is built such that multiple funding private keys could be used in the future
    var fundingKeypair = DashDrop._keyToKeypair(data.fundingKey);
    if (!data.fundingKey || !fundingKeypair.privateKey) {
      window.alert("Please choose a Private Key with sufficient funds as a funding source.");
      return;
    }

    var keypairs = data.keypairs.slice(0);
    var keysets = [];
    while (keypairs.length) {
      keysets.push(keypairs.splice(0, config.outputsPerTransaction));
    }
    if (keysets.length > 1) {
      window.alert("Only the first " + config.outputsPerTransaction + " wallets will be filled (1000 outputs per UTXO per private key).");
      keysets.length = 1;
    }

    function nextTx(x) {
      var keyset = keysets.shift();
      if (!keyset) {
        return Promise.resolve(x);
      }

      var rawTx = DashDrop.disburse({
        utxos: data.fundingUtxos
      , src: data.fundingKey
      , dsts: keyset.map(function (kp) { return kp.publicKey; }).filter(Boolean)
      , amount: config.walletAmount
      , fee: config.transactionFee
      });
      console.log('transaction:');
      console.log(rawTx);

      var restTx = {
        url: config.insightBaseUrl + '/tx/send'
      , method: 'POST'
      , headers: { 'Content-Type': 'application/json' }
      , body: JSON.stringify({ rawtx: rawTx })
      };

      keyset.forEach(function (kp) {
        localStorage.setItem('dash:' + kp.publicKey, JSON.stringify({
          privateKey: kp.privateKey
        , publicKey: kp.publicKey
        , amount: (kp.amount || 0) + config.walletAmount
        , commited: false
        }));
      });

      return window.fetch(restTx.url, restTx).then(function (resp) {
        // 258: txn-mempool-conflict. Code:-26
        return resp.json().then(function (result) {
          console.log('result:');
          console.log(result);
          keyset.forEach(function (kp) {
            localStorage.setItem('dash:' + kp.publicKey, JSON.stringify({
              privateKey: kp.privateKey
            , publicKey: kp.publicKey
            , amount: (kp.amount || 0) + config.walletAmount
            , commited: true
            }));
          });

          return result;
        });
      }).then(function (y) { return y; }, function (err) {
        console.error("Disburse Commit Transaction Error:");
        console.error(err);
        window.alert("An error occured. Transaction may have not committed.");
      }).then(function (y) {
        return nextTx(y || x);
      });
    }

    return nextTx().then(function (result) {
      $('.js-transaction-commit-complete').removeClass('hidden');
      $('.js-transaction-id').text(result.txid);

      // Don't allow changing of keys
      $('button.js-paper-wallet-generate').prop('disabled', true);
      $('textarea.js-paper-wallet-keys').prop('disabled', true);
      $('input.js-paper-wallet-quantity').prop('disabled', true);
      $('body').off('keyup', '.js-paper-wallet-keys', DashDom.updateWalletCsv);
      $('body').off('click', '.js-paper-wallet-generate', DashDom.generateWallets);
      $('body').off('keyup', '.js-paper-wallet-quantity', DashDom.updateWalletQuantity);
      // Don't allow anything else
      $('input.js-transaction-fee').prop('disabled', true);
      $('input.js-funding-key').prop('disabled', true);
      $('input.js-paper-wallet-amount').prop('disabled', true);
    });
  };
  DashDom.inspectWallets = function (wallets) {
    var resultsMap = {};
    var valIn = 0;
    var valOut = 0
    var mostRecent = 0;
    var leastRecent = Infinity;

    $('.js-paper-wallet-total').text(wallets.length);

    if (!wallets.length) {
      return Promise.resolve();
    }

    return DashDrop.inspectWallets({
      wallets: wallets
    , progress: function (progress) {
        function createMap(addr) {
          return { change: 0, value: 0, in: 0, out: 0, satoshis: 0, utxos: [], txs: [], addr: addr };
        }

        // If there are both unspent transactions and spent transactions,
        // then we should probably not reclaim this address

        if (progress.data.utxos) {
          progress.data.utxos.forEach(function (utxo) {
            function insert(map) {
              if (!map[utxo.address]) {
                map[utxo.address] = createMap(utxo.address);
              }

              map[utxo.address].utxos.push(utxo);
              map[utxo.address].satoshis += utxo.satoshis;
            }

            insert(resultsMap);
            /*
            if (utxo.confirmations >= 6) {
              ledger += utxo.address + ' ' + utxo.satoshis + ' (' + utxo.confirmations + '+ confirmations)' + '\n';
            } else {
              ledger += utxo.address + ' ' + utxo.satoshis + ' (~' + utxo.confirmations + ' confirmations)' + '\n';
            }

            if (utxo.confirmations >= 6 && utxo.satoshis) {
              if (!data.claimableMap[utxo.address + utxo.txid]) {
                data.claimableMap[utxo.address + utxo.txid] = true;
                data.claimable.push(utxo);
              }
            }
            */
          });
        }
        if (progress.data.items) {
          progress.data.items.forEach(function (tx) {
            var addr;
            // each vin is actually a utxo
            tx.vin.forEach(function (vin) {
              addr = vin.addr;
              var val = Math.round((parseFloat(vin.value, 10) || 0) * config.SATOSHIS_PER_DASH);
              if (!resultsMap[vin.addr]) {
                resultsMap[vin.addr] = createMap(vin.addr.address);
              }
              resultsMap[vin.addr].loaded = true;
              resultsMap[vin.addr].in += val;
              valIn += val;
            });
            resultsMap[addr].txs.push(tx);
            resultsMap[addr].time = tx.time * 1000;
            mostRecent = Math.max(resultsMap[addr].time, mostRecent);
            leastRecent = Math.min(resultsMap[addr].time, leastRecent)
            tx.vout.forEach(function (vout) {
              var val = Math.round((parseFloat(vout.value, 10) || 0) * config.SATOSHIS_PER_DASH);
              vout.scriptPubKey.addresses.forEach(function (_addr) {
                if (_addr === addr) {
                  // self used as change address, not actually spent
                  // this will be represented as utxo
                  //resultsMap[addr].value == val;
                  return;
                }
                resultsMap[addr].out += val;
                valOut += val;
              });
            });
          });
        }
      }
    }).then(function () {
      var satoshis = 0;
      var count = 0;
      var fullMap = {};
      var dirtyMap = {};
      var emptyMap = {};
      var otherMap = {};
      var newMap = {};

      console.log('resultsMap:');
      console.log(resultsMap);
      Object.keys(resultsMap).forEach(function (addr) {
        var txs = resultsMap[addr];
        if ((txs.txs.length && txs.utxos.length) || txs.utxos.length > 1) {
          dirtyMap[addr] = txs;
        } else if (1 === txs.utxos.length) {
          fullMap[addr] = txs;
        } else if (txs.time) {
          emptyMap[addr] = txs;
        } else {
          otherMap[addr] = txs;
        }
      });

      wallets.forEach(function (w) {
        if (!resultsMap[w.publicKey]) {
          newMap[w.publicKey] = createMap(w.publicKey);
        } else {
          satoshis += resultsMap[w.publicKey].satoshis;
          count += 1;
        }
      });

      // TODO need to check which were loaded, unloaded
      var allCount = wallets.length;
      var fullCount = Object.keys(fullMap).length;
      var dirtyCount = Object.keys(dirtyMap).length;
      var emptyCount = Object.keys(emptyMap).length;
      var usedCount = emptyCount + dirtyCount;
      var loadedCount = fullCount + emptyCount + dirtyCount;
      var otherCount = Object.keys(otherMap).length;
      var newCount = Object.keys(newMap).length;
      // otherCount and newCount should be the same... right?
      console.log('allCount', allCount);
      console.log('fullCount', fullCount);
      console.log('dirtyCount', dirtyCount);
      console.log('emptyCount', emptyCount);
      console.log('loadedCount', loadedCount);
      console.log('otherCount', otherCount);
      console.log('newCount', newCount);
      console.log('valIn', valIn);
      console.log('valOut', valOut);
      console.log('satoshis', satoshis);
      console.log('mostRecent', new Date(mostRecent).toISOString());
      console.log('leastRecent', new Date(leastRecent).toISOString());

      var percent = Math.round((usedCount / (loadedCount || 1)) * 100);

      $('.js-paper-wallet-percent').text(percent);
      $('.js-paper-wallet-used').text(usedCount);
      $('.js-paper-wallet-loaded').text(loadedCount);
      $('.js-paper-wallet-balance').text(satoshis);
      $('.js-paper-wallet-balance-out').text(valIn); // it's gone out if it's been used as an input
      //$('.js-paper-wallet-balance-out').text(valOut);
      $('.js-paper-wallet-balance-in').text(valIn + satoshis);
      $('.js-paper-wallet-most-recent').text(new Date(mostRecent).toLocaleString());
      $('.js-paper-wallet-least-recent').text(new Date(leastRecent).toLocaleString());
      //$('.js-paper-wallet-least-recent').text(new Date(leastRecent).toLocaleDateString());
    });
  };
  DashDrop.inspectWallets = function (opts) {
    var addrs = opts.wallets.map(DashDrop._keypairToPublicKey);
    var total = addrs.length;
    var count = 0;
    var addrses = [];
    var MAX_BATCH_SIZE = 10;
    var set;

    while (addrs.length) {
      set = addrs.splice(0, MAX_BATCH_SIZE);
      count += set.length;
      addrses.push(set);
    };

    function nextBatch(addrs) {
      if (!addrs) { console.log('addrs:', addrs); return; }

      // https://api.dashdrop.coolaj86.com/insight-api-dash/addrs/XbxDxU8ry96ZpXm4wDiFdpRNGiWuXfemNK,Xr7x52ykWX7FmCcuy32zC2F69817vuwywU/utxo
      var url = config.insightBaseUrl + '/addrs/:addrs/utxo'.replace(':addrs', addrs.join(','));
      var utxos;

      return window.fetch(url, { mode: 'cors' }).then(function (resp) {
        return resp.json().then(function (_utxos) {
          utxos = _utxos;
          console.log('utxos resp.json():', url);
          console.log(utxos);
        });
      }, function (err) {
        console.error('UTXO Error:');
        console.error(err);
        return null;
      }).then(function () {
        // https://api.dashdrop.coolaj86.com/insight-api-dash/addrs/XbxDxU8ry96ZpXm4wDiFdpRNGiWuXfemNK,Xr7x52ykWX7FmCcuy32zC2F69817vuwywU/txs
        var url = config.insightBaseUrl + '/addrs/:addrs/txs'.replace(':addrs', addrs.join(','));
        var results;

        return window.fetch(url, { mode: 'cors' }).then(function (resp) {
          return resp.json().then(function (_results) {
            results = _results;
            console.log('txs resp.json():', url);
            console.log(results);
          });
        }, function (err) {
          console.error('Transaction Error:');
          console.error(err);
        }).then(function () {
          if ('function' === typeof opts.progress) {
            if (!results) { results = {}; }
            results.utxos = utxos;
            opts.progress({ data: results, count: count, total: total });
          }

          return nextBatch(addrses.shift());
        });
      });
    }

    return nextBatch(addrses.shift());
  };
  DashDom.commitReclaim = function () {
    var txObj = {
      utxos: data.claimable
    , srcs: DashDom._getWallets().map(function () {
            })
    , dst: data.addr || data.wif
    , fee: config.transactionFee
    };
    var rawTx = DashDrop.claim(txObj);

    console.log('reclaim rawTx:');
    console.log(txObj);
    console.log(rawTx);

    var restTx = {
      url: config.insightBaseUrl + '/tx/send'
    , method: 'POST'
    , headers: {
        'Content-Type': 'application/json' //; charset=utf-8
      }
    , body: JSON.stringify({ rawtx: rawTx })
    };

    return window.fetch(restTx.url, restTx).then(function (resp) {
      return resp.json().then(function (result) {
        console.log('result:');
        console.log(result);

        // TODO demote these once the transactions are confirmed?
        /*
        data.privateKeys.forEach(function (sk) {
          localStorage.removeItem('dash:' + sk);
          localStorage.setItem('spent-dash:' + sk, 0);
        });
        */
        return result;
      });
    });
  };
  DashDom.print = function () {
    window.print();
  };
  DashDom.downloadCsv = function () {
    var hiddenElement = document.createElement('a');
    hiddenElement.href = 'data:text/csv;base64,' + btoa(data.csv);
    hiddenElement.target = '_blank';
    hiddenElement.download = 'dash-paper-wallets.csv';
    hiddenElement.click();
  }
  DashDom.importCsv = function () {
    $('.js-csv-import-file').click();
  }
  DashDom.uploadCsv = function () {
    $('.js-csv-upload-file').click();
  }
  DashDom._parseFileCsv = function (file, cb) {
    var reader = new FileReader();
    reader.addEventListener('error', function () {
      window.alert("Error parsing CSV");
    });
    reader.addEventListener('load', function (ev) {
			data.csv = ev.target.result;
			$('.js-paper-wallet-keys').val(data.csv);
      console.log('data.csv:');
      console.log(data.csv);
      DashDom.updateWalletCsv();
      console.log('data.keypairs:');
      console.log(data.keypairs);
      cb();
    });
    reader.readAsText(file);
  };
  DashDom.importFileCsv = function () {
    var file = $('.js-csv-import-file')[0].files[0];
    DashDom._parseFileCsv(file, function () {
      DashDom.initCsv();
    });
  };
  DashDom.parseFileCsv = function () {
    var file = $('.js-csv-upload-file')[0].files[0];
    DashDom._parseFileCsv(file, function () {
      view.csv.show();
    });
  }
  DashDom.showExampleCsv = function () {
    view.csv.show();
    $('.js-paper-wallet-keys').attr('placeholder', exampleCsv);
  };
  DashDom.showCsv = function () {
    view.csv.show();
    $('.js-paper-wallet-keys').removeAttr('placeholder');
  };
  DashDom.updateFeeSchedule = function () {
    var fee = parseInt($('.js-transaction-fee').val(), 10);
    if (fee && !isNaN(fee)) {
      config.transactionFee = fee;
      DashDom.updateTransactionTotal();
    }
    return true;
  };
  DashDom.initReclaim = function () {
    var wallets = DashDom._getWallets().filter(DashDom._hasBalance);
    return DashDom.inspectWallets(wallets);
  };
  DashDom.initCsv = function () {
    var wallets = data.keypairs; //DashDom._getWallets();
    return DashDom.inspectWallets(wallets);
  };


  //
  // Reclaim Wallets
  //
  DashDom.views.generate = function () {
    DashDom.generateWallets();
    $('.js-flow').addClass('hidden');
    $('.js-flow-generate').removeClass('hidden');
    setTimeout(function () {
      $('.js-flow-generate').addClass('in');
    });
  };
  DashDom.views.reclaim = function () {
    $('.js-flow').addClass('hidden');
    $('.js-flow-reclaim').removeClass('hidden');
    setTimeout(function () {
      $('.js-flow-reclaim').addClass('in');
    });
    DashDom.initReclaim();
  };

  var view = {};
  view.csv = {
    toggle: function () {
      console.log('click, csv toggle');
      if ($('.js-csv-view').hasClass('hidden')) {
        $('.js-csv-view').removeClass('hidden');
      } else {
        $('.js-csv-view').addClass('hidden');
      }
    }
  , show: function () {
      $('.js-csv-view').removeClass('hidden');
    }
  , hide: function () {
      $('.js-csv-view').addClass('hidden');
    }
  };



  // Switch views
  $('body').on('click', 'button.js-flow-generate', DashDom.views.generate);
  $('body').on('click', 'button.js-flow-reclaim', DashDom.views.reclaim);

  // Wallet Generation Related
  $('body').on('keyup', '.js-paper-wallet-keys', DashDom.updateWalletCsv);
  $('body').on('click', '.js-paper-wallet-generate', DashDom.generateWallets);
  $('body').on('keyup', '.js-paper-wallet-quantity', DashDom.updateWalletQuantity);

  // Save related
  $('body').on('click', '.js-csv-hide', view.csv.hide);
  $('body').on('click', '.js-csv-show', DashDom.showCsv);
  $('body').on('click', '.js-csv-download', DashDom.downloadCsv);
  $('body').on('click', '.js-csv-import', DashDom.importCsv);
  $('body').on('change', '.js-csv-import-file', DashDom.importFileCsv);
  $('body').on('click', '.js-csv-upload', DashDom.uploadCsv);
  $('body').on('change', '.js-csv-upload-file', DashDom.parseFileCsv);
  $('body').on('click', '.js-csv-example', DashDom.showExampleCsv);
  $('body').on('click', '.js-paper-wallet-print', DashDom.print);

  // Transaction Related
  $('body').on('change', '.js-insight-base', DashDom.updateInsightBase);
  $('body').on('keyup', '.js-funding-key', DashDom.updateFundingKey);
  $('body').on('click', '.js-transaction-commit', DashDom.commitDisburse);
  $('body').on('keyup', '.js-paper-wallet-amount', DashDom.updateWalletAmount);
  $('body').on('keyup', '.js-transaction-fee', DashDom.updateFeeSchedule);

  // Reclaim Related
  //$('body').on('click', '.js-airdrop-inspect', DashDom.inspectWallets);
  $('body').on('click', '.js-airdrop-reclaim', DashDom.commitReclaim);


  //
  // Initial Values
  //
  $('.js-insight-base').val(config.insightBaseUrl);
  $('.js-insight-base').text(config.insightBaseUrl);
  $('.js-paper-wallet-cache').prop('checked', 'checked');
  $('.js-paper-wallet-cache').removeProp('checked');
  $('.js-paper-wallet-amount').val(config.walletAmount);
  $('.js-paper-wallet-amount').text(config.walletAmount);
  $('.js-paper-wallet-quantity').val(config.walletQuantity);
  $('.js-paper-wallet-quantity').text(config.walletQuantity);
  $('.js-transaction-fee').val(config.transactionFee);
  $('.js-transaction-fee').text(config.transactionFee);
  $('[name=js-fee-schedule]').val(config.transactionFee);
  DashDom.updateTransactionTotal();


  DEBUG_DASH_AIRDROP.config = config;
  DEBUG_DASH_AIRDROP.data = data;
});
