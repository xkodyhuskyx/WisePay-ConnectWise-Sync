"use strict";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const PBKDF2_ITERATIONS = 600000;

async function deriveEncryptionKey(password, salt, iterations = PBKDF2_ITERATIONS) {
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        TEXT_ENCODER.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations,
            hash: "SHA-256"
        },
        passwordKey,
        {
            name: "AES-GCM",
            length: 256
        },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptCredentials(credentials, password) {
    validatePassword(password);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveEncryptionKey(password, salt);

    const plaintext = TEXT_ENCODER.encode(JSON.stringify(credentials));

    const encryptedData = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv
        },
        key,
        plaintext
    );

    return {
        version: 1,
        iterations: PBKDF2_ITERATIONS,
        salt: arrayBufferToBase64(salt),
        iv: arrayBufferToBase64(iv),
        encryptedCredentials: arrayBufferToBase64(encryptedData)
    };
}

async function decryptCredentials(encryptedRecord, password) {
    validatePassword(password);

    if (
        !encryptedRecord ||
        encryptedRecord.version !== 1 ||
        !encryptedRecord.salt ||
        !encryptedRecord.iv ||
        !encryptedRecord.encryptedCredentials
    ) {
        throw new Error("The saved credential record is invalid.");
    }

    const salt = base64ToUint8Array(encryptedRecord.salt);
    const iv = base64ToUint8Array(encryptedRecord.iv);
    const encryptedData = base64ToUint8Array(
        encryptedRecord.encryptedCredentials
    );

    const iterations = Number(
        encryptedRecord.iterations ?? PBKDF2_ITERATIONS
    );

    const key = await deriveEncryptionKey(
        password,
        salt,
        iterations
    );

    try {
        const decryptedData = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv
            },
            key,
            encryptedData
        );

        return JSON.parse(TEXT_DECODER.decode(decryptedData));
    } catch {
        throw new Error(
            "The unlock password is incorrect or the saved data is damaged."
        );
    }
}

function validatePassword(password) {
    if (typeof password !== "string" || password.length < 5) {
        throw new Error(
            "The unlock password must be at least 5 characters long."
        );
    }
}

function arrayBufferToBase64(value) {
    const bytes =
        value instanceof Uint8Array
            ? value
            : new Uint8Array(value);

    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

function base64ToUint8Array(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}
