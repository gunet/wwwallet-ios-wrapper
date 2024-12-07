//
//  JavaScriptBridge.js
//  Funke Wallet
//
//  Created by Jens Utbult on 2024-11-29.
//


const stringifyBinary = (key, value) => {
    if (value instanceof Uint8Array) {
        return CM_base64url_encode(value);
    } else if (value instanceof ArrayBuffer) {
        return CM_base64url_encode(new Uint8Array(value));
    } else {
        return value;
    }
};

const stringify = (data) => {
    return JSON.stringify(data, stringifyBinary);
};

function CM_base64url_decode(value) {
    var m = value.length % 4;
    return Uint8Array.from(atob(value.replace(/-/g, '+')
                                .replace(/_/g, '/')
                                .padEnd(value.length + (m === 0 ? 0 : 4 - m), '=')), function (c)
                            { return c.charCodeAt(0); }).buffer;
}

function CM_base64url_encode(buffer) {
    return btoa(Array.from(new Uint8Array(buffer), function (b)
                            { return String.fromCharCode(b); }).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+${'$'}/, '');
}


var __webauthn_hooks__;
(function (__webauthn_hooks__) {

    if (!__webauthn_hooks__.originalCreateFunction) {
        __webauthn_hooks__.originalCreateFunction = navigator.credentials.create.bind(navigator.credentials);
    }
    if (!__webauthn_hooks__.originalGetFunction) {
        __webauthn_hooks__.originalGetFunction = navigator.credentials.get.bind(navigator.credentials);
    }

    function recodeLargeBlob(value) {
        largeBlob = {}
        if (value.hasOwnProperty('blob')) {
            largeBlob['blob'] = CM_base64url_decode(value.blob);
        }
        if (value.hasOwnProperty('supported')) {
            largeBlob['supported'] = value.supported;
        }
        if (value.hasOwnProperty('written')) {
            largeBlob['written'] = value.written;
        }
        return largeBlob;
    }

    function recodePrf(value) {
        console.log("Recode prf input: " + stringify(value));
        recodedPrf = {}

        if (value.hasOwnProperty('enabled')) {
            recodedPrf['enabled'] = value['enabled'];
        }

        if (value.hasOwnProperty('results')) {
            resultsValue = {}
            if (value['results'].hasOwnProperty('first')) {
                resultsValue['first'] = CM_base64url_decode(value['results']['first']);
            }
            if (value['results'].hasOwnProperty('second')) {
                resultsValue['second'] = CM_base64url_decode(value['results']['second']);
            }
            recodedPrf['results'] = resultsValue;
        }

        console.log("Recode prf output: " + stringify(recodedPrf));
        return recodedPrf;
    }

    function recodeSign(value) {
        console.log("Recode sign input: " + stringify(value));
        recodedSign = {}

        if (value.hasOwnProperty('generatedKey')) {
            generatedKeyValue = {}
            if (value['generatedKey'].hasOwnProperty('publicKey')) {
                generatedKeyValue['publicKey'] = CM_base64url_decode(value['generatedKey']['publicKey']);
            }
            if (value['generatedKey'].hasOwnProperty('keyHandle')) {
                generatedKeyValue['keyHandle'] = CM_base64url_decode(value['generatedKey']['keyHandle']);
            }
            recodedSign['generatedKey'] = generatedKeyValue;
        }

        if (value.hasOwnProperty('signature')) {
            recodedSign['signature'] = CM_base64url_decode(value['signature']);
        }

        console.log("Recode sign output: " + stringify(recodedSign));
        return recodedSign;
    }

    function decodeReply(decoded_reply) {
        decoded_reply.rawId = CM_base64url_decode(decoded_reply.rawId);
        decoded_reply.response.clientDataJSON = CM_base64url_decode(decoded_reply.response.clientDataJSON);
        if (decoded_reply.response.hasOwnProperty('attestationObject')) {
            decoded_reply.response.attestationObject = CM_base64url_decode(decoded_reply.response.attestationObject);
        }
        if (decoded_reply.response.hasOwnProperty('authenticatorData')) {
            decoded_reply.response.authenticatorData = CM_base64url_decode(decoded_reply.response.authenticatorData);
        }
        if (decoded_reply.response.hasOwnProperty('signature')) {
            decoded_reply.response.signature = CM_base64url_decode(decoded_reply.response.signature);
        }
        if (decoded_reply.response.hasOwnProperty('userHandle')) {
            decoded_reply.response.userHandle = CM_base64url_decode(decoded_reply.response.userHandle);
        }
        decoded_reply.getClientExtensionResults = function getClientExtensionResults() {
            result = decoded_reply.hasOwnProperty('clientExtensionResults')
            ? decoded_reply.clientExtensionResults
            : {};

            dict = {};
            for(key in result) {
                if (result.hasOwnProperty(key)) {
                    if (key == "largeBlob") {
                        dict['largeBlob'] = recodeLargeBlob(result[key]);
                    } else if (key == "prf") {
                        dict['prf'] = recodePrf(result[key]);
                    } else if (key == "sign") {
                        dict['sign'] = recodeSign(result[key]);
                    } else {
                        dict[key] = result[key];
                    }
                }
            }
            console.log("Returning result: " + JSON.stringify(dict, stringifyBinary));
            return dict;
        }
        decoded_reply.response.getTransports = function getTransports() {
            return decoded_reply.response.transports;
        }
        return decoded_reply;
    }

    console.log("Initializing webauthn hooks");

    function create(request) {
        console.log("Executing create with request: " + request);
        if (!("publicKey" in request)) {
            return __webauthn_hooks__.originalCreateFunction(request);
        }
        var json = stringify({ "type": "create", "request": request.publicKey });
        console.log("Post message: " + json);
        return window.webkit.messageHandlers.__webauthn_create_interface__.postMessage(json)
        .then(onReply)
        .catch(
               function(err) {
                   console.log("error: ", err);
                   if (err == "0x19") {
                       throw new DOMException("This authenticator is already registered.", "InvalidStateError");
                   }
                   throw err;
               }
        );
    }
    __webauthn_hooks__.create = create;

    function get(request) {
        console.log("Executing get with request" + request);
        if (!("publicKey" in request)) {
            return __webauthn_hooks__.originalGetFunction(request);
        }
        var json = stringify({ "type": "get", "request": request.publicKey });
        return window.webkit.messageHandlers.__webauthn_get_interface__.postMessage(json)
        .then(onReply)
        .catch(
               function(err) {
                   console.log("error: ", err);
                   throw err;
               }
        );
    }
    __webauthn_hooks__.get = get;

    // reply handlers
    // The embedder gives replies back here, caught by the event listener.
    function onReply(msg) {
        var reply = JSON.parse(msg.data);
        console.log("Called onReply with " + msg);

        if (reply[0] != 'success') {
          throw new DOMException(reply[1], "NotAllowedError");
        }
        var cred = decodeReply(reply[1]);
        console.log("Created or got credential: " + reply[1])
        return cred;
    }

})(__webauthn_hooks__ || (__webauthn_hooks__ = {}));

navigator.credentials.create = __webauthn_hooks__.create;
navigator.credentials.get = __webauthn_hooks__.get;

// Some sites test that `typeof window.PublicKeyCredential` is `function`.
window.PublicKeyCredential = (function () { });
window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable =
function () {
    return Promise.resolve(false);
};

console.log("webauthn hooks initialized");

window.nativeWrapper = (function (nativeWrapper) {
    console.log("Initializing nativeWrapper");

    function createBluetoothMethod(funcName) {
        nativeWrapper[funcName] = function (arg) {
            console.log(funcName, arg);
            return window.webkit.messageHandlers['__' + funcName + '__'].postMessage(stringify(arg))
              .then(function (msg) {
                  console.log(funcName, "raw result:", msg);
                  var reply = JSON.parse(msg);
                  console.log(funcName, "result:", reply);
                  return reply;
              })
              .catch(
                  function (err) {
                      console.log("error: ", err);
                      throw err;
                  }
              );
        };
    }

    createBluetoothMethod('bluetoothStatus');
    createBluetoothMethod('bluetoothTerminate');
    createBluetoothMethod('bluetoothCreateServer');
    createBluetoothMethod('bluetoothCreateClient');
    createBluetoothMethod('bluetoothSendToServer');
    createBluetoothMethod('bluetoothSendToClient');
    createBluetoothMethod('bluetoothReceiveFromClient');
    createBluetoothMethod('bluetoothReceiveFromServer');

    console.log("nativeWrapper initialized");

    return nativeWrapper;
})({});
