// Sources flattened with hardhat v2.23.0 https://hardhat.org

// SPDX-License-Identifier: LZBL-1.2 AND MIT AND Unlicense

// File @layerzerolabs/lz-evm-protocol-v2/contracts/libs/CalldataBytesLib.sol@v3.0.110

// Original license: SPDX_License_Identifier: LZBL-1.2

pragma solidity ^0.8.20;

library CalldataBytesLib {
    function toU8(bytes calldata _bytes, uint256 _start) internal pure returns (uint8) {
        return uint8(_bytes[_start]);
    }

    function toU16(bytes calldata _bytes, uint256 _start) internal pure returns (uint16) {
        unchecked {
            uint256 end = _start + 2;
            return uint16(bytes2(_bytes[_start:end]));
        }
    }

    function toU32(bytes calldata _bytes, uint256 _start) internal pure returns (uint32) {
        unchecked {
            uint256 end = _start + 4;
            return uint32(bytes4(_bytes[_start:end]));
        }
    }

    function toU64(bytes calldata _bytes, uint256 _start) internal pure returns (uint64) {
        unchecked {
            uint256 end = _start + 8;
            return uint64(bytes8(_bytes[_start:end]));
        }
    }

    function toU128(bytes calldata _bytes, uint256 _start) internal pure returns (uint128) {
        unchecked {
            uint256 end = _start + 16;
            return uint128(bytes16(_bytes[_start:end]));
        }
    }

    function toU256(bytes calldata _bytes, uint256 _start) internal pure returns (uint256) {
        unchecked {
            uint256 end = _start + 32;
            return uint256(bytes32(_bytes[_start:end]));
        }
    }

    function toAddr(bytes calldata _bytes, uint256 _start) internal pure returns (address) {
        unchecked {
            uint256 end = _start + 20;
            return address(bytes20(_bytes[_start:end]));
        }
    }

    function toB32(bytes calldata _bytes, uint256 _start) internal pure returns (bytes32) {
        unchecked {
            uint256 end = _start + 32;
            return bytes32(_bytes[_start:end]);
        }
    }
}


// File @layerzerolabs/lz-evm-messagelib-v2/contracts/libs/ExecutorOptions.sol@v3.0.110

// Original license: SPDX_License_Identifier: LZBL-1.2

pragma solidity ^0.8.20;

library ExecutorOptions {
    using CalldataBytesLib for bytes;

    uint8 internal constant WORKER_ID = 1;

    uint8 internal constant OPTION_TYPE_LZRECEIVE = 1;
    uint8 internal constant OPTION_TYPE_NATIVE_DROP = 2;
    uint8 internal constant OPTION_TYPE_LZCOMPOSE = 3;
    uint8 internal constant OPTION_TYPE_ORDERED_EXECUTION = 4;
    uint8 internal constant OPTION_TYPE_LZREAD = 5;

    error Executor_InvalidLzReceiveOption();
    error Executor_InvalidNativeDropOption();
    error Executor_InvalidLzComposeOption();
    error Executor_InvalidLzReadOption();

    /// @dev decode the next executor option from the options starting from the specified cursor
    /// @param _options [executor_id][executor_option][executor_id][executor_option]...
    ///        executor_option = [option_size][option_type][option]
    ///        option_size = len(option_type) + len(option)
    ///        executor_id: uint8, option_size: uint16, option_type: uint8, option: bytes
    /// @param _cursor the cursor to start decoding from
    /// @return optionType the type of the option
    /// @return option the option of the executor
    /// @return cursor the cursor to start decoding the next executor option
    function nextExecutorOption(
        bytes calldata _options,
        uint256 _cursor
    ) internal pure returns (uint8 optionType, bytes calldata option, uint256 cursor) {
        unchecked {
            // skip worker id
            cursor = _cursor + 1;

            // read option size
            uint16 size = _options.toU16(cursor);
            cursor += 2;

            // read option type
            optionType = _options.toU8(cursor);

            // startCursor and endCursor are used to slice the option from _options
            uint256 startCursor = cursor + 1; // skip option type
            uint256 endCursor = cursor + size;
            option = _options[startCursor:endCursor];
            cursor += size;
        }
    }

    function decodeLzReceiveOption(bytes calldata _option) internal pure returns (uint128 gas, uint128 value) {
        if (_option.length != 16 && _option.length != 32) revert Executor_InvalidLzReceiveOption();
        gas = _option.toU128(0);
        value = _option.length == 32 ? _option.toU128(16) : 0;
    }

    function decodeNativeDropOption(bytes calldata _option) internal pure returns (uint128 amount, bytes32 receiver) {
        if (_option.length != 48) revert Executor_InvalidNativeDropOption();
        amount = _option.toU128(0);
        receiver = _option.toB32(16);
    }

    function decodeLzComposeOption(
        bytes calldata _option
    ) internal pure returns (uint16 index, uint128 gas, uint128 value) {
        if (_option.length != 18 && _option.length != 34) revert Executor_InvalidLzComposeOption();
        index = _option.toU16(0);
        gas = _option.toU128(2);
        value = _option.length == 34 ? _option.toU128(18) : 0;
    }

    function decodeLzReadOption(
        bytes calldata _option
    ) internal pure returns (uint128 gas, uint32 calldataSize, uint128 value) {
        if (_option.length != 20 && _option.length != 36) revert Executor_InvalidLzReadOption();
        gas = _option.toU128(0);
        calldataSize = _option.toU32(16);
        value = _option.length == 36 ? _option.toU128(20) : 0;
    }

    function encodeLzReceiveOption(uint128 _gas, uint128 _value) internal pure returns (bytes memory) {
        return _value == 0 ? abi.encodePacked(_gas) : abi.encodePacked(_gas, _value);
    }

    function encodeNativeDropOption(uint128 _amount, bytes32 _receiver) internal pure returns (bytes memory) {
        return abi.encodePacked(_amount, _receiver);
    }

    function encodeLzComposeOption(uint16 _index, uint128 _gas, uint128 _value) internal pure returns (bytes memory) {
        return _value == 0 ? abi.encodePacked(_index, _gas) : abi.encodePacked(_index, _gas, _value);
    }

    function encodeLzReadOption(
        uint128 _gas,
        uint32 _calldataSize,
        uint128 _value
    ) internal pure returns (bytes memory) {
        return _value == 0 ? abi.encodePacked(_gas, _calldataSize) : abi.encodePacked(_gas, _calldataSize, _value);
    }
}


// File @layerzerolabs/lz-evm-protocol-v2/contracts/messagelib/libs/BitMaps.sol@v3.0.110

// Original license: SPDX_License_Identifier: MIT

// modified from https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/structs/BitMaps.sol
pragma solidity ^0.8.20;

type BitMap256 is uint256;

using BitMaps for BitMap256 global;

library BitMaps {
    /**
     * @dev Returns whether the bit at `index` is set.
     */
    function get(BitMap256 bitmap, uint8 index) internal pure returns (bool) {
        uint256 mask = 1 << index;
        return BitMap256.unwrap(bitmap) & mask != 0;
    }

    /**
     * @dev Sets the bit at `index`.
     */
    function set(BitMap256 bitmap, uint8 index) internal pure returns (BitMap256) {
        uint256 mask = 1 << index;
        return BitMap256.wrap(BitMap256.unwrap(bitmap) | mask);
    }
}


// File solidity-bytes-utils/contracts/BytesLib.sol@v0.8.4

// Original license: SPDX_License_Identifier: Unlicense
/*
 * @title Solidity Bytes Arrays Utils
 * @author Gonçalo Sá <goncalo.sa@consensys.net>
 *
 * @dev Bytes tightly packed arrays utility library for ethereum contracts written in Solidity.
 *      The library lets you concatenate, slice and type cast bytes arrays both in memory and storage.
 */
pragma solidity >=0.8.0 <0.9.0;


library BytesLib {
    function concat(
        bytes memory _preBytes,
        bytes memory _postBytes
    )
        internal
        pure
        returns (bytes memory)
    {
        bytes memory tempBytes;

        assembly {
            // Get a location of some free memory and store it in tempBytes as
            // Solidity does for memory variables.
            tempBytes := mload(0x40)

            // Store the length of the first bytes array at the beginning of
            // the memory for tempBytes.
            let length := mload(_preBytes)
            mstore(tempBytes, length)

            // Maintain a memory counter for the current write location in the
            // temp bytes array by adding the 32 bytes for the array length to
            // the starting location.
            let mc := add(tempBytes, 0x20)
            // Stop copying when the memory counter reaches the length of the
            // first bytes array.
            let end := add(mc, length)

            for {
                // Initialize a copy counter to the start of the _preBytes data,
                // 32 bytes into its memory.
                let cc := add(_preBytes, 0x20)
            } lt(mc, end) {
                // Increase both counters by 32 bytes each iteration.
                mc := add(mc, 0x20)
                cc := add(cc, 0x20)
            } {
                // Write the _preBytes data into the tempBytes memory 32 bytes
                // at a time.
                mstore(mc, mload(cc))
            }

            // Add the length of _postBytes to the current length of tempBytes
            // and store it as the new length in the first 32 bytes of the
            // tempBytes memory.
            length := mload(_postBytes)
            mstore(tempBytes, add(length, mload(tempBytes)))

            // Move the memory counter back from a multiple of 0x20 to the
            // actual end of the _preBytes data.
            mc := end
            // Stop copying when the memory counter reaches the new combined
            // length of the arrays.
            end := add(mc, length)

            for {
                let cc := add(_postBytes, 0x20)
            } lt(mc, end) {
                mc := add(mc, 0x20)
                cc := add(cc, 0x20)
            } {
                mstore(mc, mload(cc))
            }

            // Update the free-memory pointer by padding our last write location
            // to 32 bytes: add 31 bytes to the end of tempBytes to move to the
            // next 32 byte block, then round down to the nearest multiple of
            // 32. If the sum of the length of the two arrays is zero then add
            // one before rounding down to leave a blank 32 bytes (the length block with 0).
            mstore(0x40, and(
              add(add(end, iszero(add(length, mload(_preBytes)))), 31),
              not(31) // Round down to the nearest 32 bytes.
            ))
        }

        return tempBytes;
    }

    function concatStorage(bytes storage _preBytes, bytes memory _postBytes) internal {
        assembly {
            // Read the first 32 bytes of _preBytes storage, which is the length
            // of the array. (We don't need to use the offset into the slot
            // because arrays use the entire slot.)
            let fslot := sload(_preBytes.slot)
            // Arrays of 31 bytes or less have an even value in their slot,
            // while longer arrays have an odd value. The actual length is
            // the slot divided by two for odd values, and the lowest order
            // byte divided by two for even values.
            // If the slot is even, bitwise and the slot with 255 and divide by
            // two to get the length. If the slot is odd, bitwise and the slot
            // with -1 and divide by two.
            let slength := div(and(fslot, sub(mul(0x100, iszero(and(fslot, 1))), 1)), 2)
            let mlength := mload(_postBytes)
            let newlength := add(slength, mlength)
            // slength can contain both the length and contents of the array
            // if length < 32 bytes so let's prepare for that
            // v. http://solidity.readthedocs.io/en/latest/miscellaneous.html#layout-of-state-variables-in-storage
            switch add(lt(slength, 32), lt(newlength, 32))
            case 2 {
                // Since the new array still fits in the slot, we just need to
                // update the contents of the slot.
                // uint256(bytes_storage) = uint256(bytes_storage) + uint256(bytes_memory) + new_length
                sstore(
                    _preBytes.slot,
                    // all the modifications to the slot are inside this
                    // next block
                    add(
                        // we can just add to the slot contents because the
                        // bytes we want to change are the LSBs
                        fslot,
                        add(
                            mul(
                                div(
                                    // load the bytes from memory
                                    mload(add(_postBytes, 0x20)),
                                    // zero all bytes to the right
                                    exp(0x100, sub(32, mlength))
                                ),
                                // and now shift left the number of bytes to
                                // leave space for the length in the slot
                                exp(0x100, sub(32, newlength))
                            ),
                            // increase length by the double of the memory
                            // bytes length
                            mul(mlength, 2)
                        )
                    )
                )
            }
            case 1 {
                // The stored value fits in the slot, but the combined value
                // will exceed it.
                // get the keccak hash to get the contents of the array
                mstore(0x0, _preBytes.slot)
                let sc := add(keccak256(0x0, 0x20), div(slength, 32))

                // save new length
                sstore(_preBytes.slot, add(mul(newlength, 2), 1))

                // The contents of the _postBytes array start 32 bytes into
                // the structure. Our first read should obtain the `submod`
                // bytes that can fit into the unused space in the last word
                // of the stored array. To get this, we read 32 bytes starting
                // from `submod`, so the data we read overlaps with the array
                // contents by `submod` bytes. Masking the lowest-order
                // `submod` bytes allows us to add that value directly to the
                // stored value.

                let submod := sub(32, slength)
                let mc := add(_postBytes, submod)
                let end := add(_postBytes, mlength)
                let mask := sub(exp(0x100, submod), 1)

                sstore(
                    sc,
                    add(
                        and(
                            fslot,
                            0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00
                        ),
                        and(mload(mc), mask)
                    )
                )

                for {
                    mc := add(mc, 0x20)
                    sc := add(sc, 1)
                } lt(mc, end) {
                    sc := add(sc, 1)
                    mc := add(mc, 0x20)
                } {
                    sstore(sc, mload(mc))
                }

                mask := exp(0x100, sub(mc, end))

                sstore(sc, mul(div(mload(mc), mask), mask))
            }
            default {
                // get the keccak hash to get the contents of the array
                mstore(0x0, _preBytes.slot)
                // Start copying to the last used word of the stored array.
                let sc := add(keccak256(0x0, 0x20), div(slength, 32))

                // save new length
                sstore(_preBytes.slot, add(mul(newlength, 2), 1))

                // Copy over the first `submod` bytes of the new data as in
                // case 1 above.
                let slengthmod := mod(slength, 32)
                let mlengthmod := mod(mlength, 32)
                let submod := sub(32, slengthmod)
                let mc := add(_postBytes, submod)
                let end := add(_postBytes, mlength)
                let mask := sub(exp(0x100, submod), 1)

                sstore(sc, add(sload(sc), and(mload(mc), mask)))

                for {
                    sc := add(sc, 1)
                    mc := add(mc, 0x20)
                } lt(mc, end) {
                    sc := add(sc, 1)
                    mc := add(mc, 0x20)
                } {
                    sstore(sc, mload(mc))
                }

                mask := exp(0x100, sub(mc, end))

                sstore(sc, mul(div(mload(mc), mask), mask))
            }
        }
    }

    function slice(
        bytes memory _bytes,
        uint256 _start,
        uint256 _length
    )
        internal
        pure
        returns (bytes memory)
    {
        // We're using the unchecked block below because otherwise execution ends 
        // with the native overflow error code.
        unchecked {
            require(_length + 31 >= _length, "slice_overflow");
        }
        require(_bytes.length >= _start + _length, "slice_outOfBounds");

        bytes memory tempBytes;

        assembly {
            switch iszero(_length)
            case 0 {
                // Get a location of some free memory and store it in tempBytes as
                // Solidity does for memory variables.
                tempBytes := mload(0x40)

                // The first word of the slice result is potentially a partial
                // word read from the original array. To read it, we calculate
                // the length of that partial word and start copying that many
                // bytes into the array. The first word we copy will start with
                // data we don't care about, but the last `lengthmod` bytes will
                // land at the beginning of the contents of the new array. When
                // we're done copying, we overwrite the full first word with
                // the actual length of the slice.
                let lengthmod := and(_length, 31)

                // The multiplication in the next line is necessary
                // because when slicing multiples of 32 bytes (lengthmod == 0)
                // the following copy loop was copying the origin's length
                // and then ending prematurely not copying everything it should.
                let mc := add(add(tempBytes, lengthmod), mul(0x20, iszero(lengthmod)))
                let end := add(mc, _length)

                for {
                    // The multiplication in the next line has the same exact purpose
                    // as the one above.
                    let cc := add(add(add(_bytes, lengthmod), mul(0x20, iszero(lengthmod))), _start)
                } lt(mc, end) {
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    mstore(mc, mload(cc))
                }

                mstore(tempBytes, _length)

                //update free-memory pointer
                //allocating the array padded to 32 bytes like the compiler does now
                mstore(0x40, and(add(mc, 31), not(31)))
            }
            //if we want a zero-length slice let's just return a zero-length array
            default {
                tempBytes := mload(0x40)
                //zero out the 32 bytes slice we are about to return
                //we need to do it because Solidity does not garbage collect
                mstore(tempBytes, 0)

                mstore(0x40, add(tempBytes, 0x20))
            }
        }

        return tempBytes;
    }

    function toAddress(bytes memory _bytes, uint256 _start) internal pure returns (address) {
        require(_bytes.length >= _start + 20, "toAddress_outOfBounds");
        address tempAddress;

        assembly {
            tempAddress := div(mload(add(add(_bytes, 0x20), _start)), 0x1000000000000000000000000)
        }

        return tempAddress;
    }

    function toUint8(bytes memory _bytes, uint256 _start) internal pure returns (uint8) {
        require(_bytes.length >= _start + 1 , "toUint8_outOfBounds");
        uint8 tempUint;

        assembly {
            tempUint := mload(add(add(_bytes, 0x1), _start))
        }

        return tempUint;
    }

    function toUint16(bytes memory _bytes, uint256 _start) internal pure returns (uint16) {
        require(_bytes.length >= _start + 2, "toUint16_outOfBounds");
        uint16 tempUint;

        assembly {
            tempUint := mload(add(add(_bytes, 0x2), _start))
        }

        return tempUint;
    }

    function toUint32(bytes memory _bytes, uint256 _start) internal pure returns (uint32) {
        require(_bytes.length >= _start + 4, "toUint32_outOfBounds");
        uint32 tempUint;

        assembly {
            tempUint := mload(add(add(_bytes, 0x4), _start))
        }

        return tempUint;
    }

    function toUint64(bytes memory _bytes, uint256 _start) internal pure returns (uint64) {
        require(_bytes.length >= _start + 8, "toUint64_outOfBounds");
        uint64 tempUint;

        assembly {
            tempUint := mload(add(add(_bytes, 0x8), _start))
        }

        return tempUint;
    }

    function toUint96(bytes memory _bytes, uint256 _start) internal pure returns (uint96) {
        require(_bytes.length >= _start + 12, "toUint96_outOfBounds");
        uint96 tempUint;

        assembly {
            tempUint := mload(add(add(_bytes, 0xc), _start))
        }

        return tempUint;
    }

    function toUint128(bytes memory _bytes, uint256 _start) internal pure returns (uint128) {
        require(_bytes.length >= _start + 16, "toUint128_outOfBounds");
        uint128 tempUint;

        assembly {
            tempUint := mload(add(add(_bytes, 0x10), _start))
        }

        return tempUint;
    }

    function toUint256(bytes memory _bytes, uint256 _start) internal pure returns (uint256) {
        require(_bytes.length >= _start + 32, "toUint256_outOfBounds");
        uint256 tempUint;

        assembly {
            tempUint := mload(add(add(_bytes, 0x20), _start))
        }

        return tempUint;
    }

    function toBytes32(bytes memory _bytes, uint256 _start) internal pure returns (bytes32) {
        require(_bytes.length >= _start + 32, "toBytes32_outOfBounds");
        bytes32 tempBytes32;

        assembly {
            tempBytes32 := mload(add(add(_bytes, 0x20), _start))
        }

        return tempBytes32;
    }

    function equal(bytes memory _preBytes, bytes memory _postBytes) internal pure returns (bool) {
        bool success = true;

        assembly {
            let length := mload(_preBytes)

            // if lengths don't match the arrays are not equal
            switch eq(length, mload(_postBytes))
            case 1 {
                // cb is a circuit breaker in the for loop since there's
                //  no said feature for inline assembly loops
                // cb = 1 - don't breaker
                // cb = 0 - break
                let cb := 1

                let mc := add(_preBytes, 0x20)
                let end := add(mc, length)

                for {
                    let cc := add(_postBytes, 0x20)
                // the next line is the loop condition:
                // while(uint256(mc < end) + cb == 2)
                } eq(add(lt(mc, end), cb), 2) {
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    // if any of these checks fails then arrays are not equal
                    if iszero(eq(mload(mc), mload(cc))) {
                        // unsuccess:
                        success := 0
                        cb := 0
                    }
                }
            }
            default {
                // unsuccess:
                success := 0
            }
        }

        return success;
    }

    function equalStorage(
        bytes storage _preBytes,
        bytes memory _postBytes
    )
        internal
        view
        returns (bool)
    {
        bool success = true;

        assembly {
            // we know _preBytes_offset is 0
            let fslot := sload(_preBytes.slot)
            // Decode the length of the stored array like in concatStorage().
            let slength := div(and(fslot, sub(mul(0x100, iszero(and(fslot, 1))), 1)), 2)
            let mlength := mload(_postBytes)

            // if lengths don't match the arrays are not equal
            switch eq(slength, mlength)
            case 1 {
                // slength can contain both the length and contents of the array
                // if length < 32 bytes so let's prepare for that
                // v. http://solidity.readthedocs.io/en/latest/miscellaneous.html#layout-of-state-variables-in-storage
                if iszero(iszero(slength)) {
                    switch lt(slength, 32)
                    case 1 {
                        // blank the last byte which is the length
                        fslot := mul(div(fslot, 0x100), 0x100)

                        if iszero(eq(fslot, mload(add(_postBytes, 0x20)))) {
                            // unsuccess:
                            success := 0
                        }
                    }
                    default {
                        // cb is a circuit breaker in the for loop since there's
                        //  no said feature for inline assembly loops
                        // cb = 1 - don't breaker
                        // cb = 0 - break
                        let cb := 1

                        // get the keccak hash to get the contents of the array
                        mstore(0x0, _preBytes.slot)
                        let sc := keccak256(0x0, 0x20)

                        let mc := add(_postBytes, 0x20)
                        let end := add(mc, mlength)

                        // the next line is the loop condition:
                        // while(uint256(mc < end) + cb == 2)
                        for {} eq(add(lt(mc, end), cb), 2) {
                            sc := add(sc, 1)
                            mc := add(mc, 0x20)
                        } {
                            if iszero(eq(sload(sc), mload(mc))) {
                                // unsuccess:
                                success := 0
                                cb := 0
                            }
                        }
                    }
                }
            }
            default {
                // unsuccess:
                success := 0
            }
        }

        return success;
    }
}


// File @layerzerolabs/lz-evm-messagelib-v2/contracts/uln/libs/DVNOptions.sol@v3.0.110

// Original license: SPDX_License_Identifier: LZBL-1.2

pragma solidity ^0.8.20;


library DVNOptions {
    using CalldataBytesLib for bytes;
    using BytesLib for bytes;

    uint8 internal constant WORKER_ID = 2;
    uint8 internal constant OPTION_TYPE_PRECRIME = 1;

    error DVN_InvalidDVNIdx();
    error DVN_InvalidDVNOptions(uint256 cursor);

    /// @dev group dvn options by its idx
    /// @param _options [dvn_id][dvn_option][dvn_id][dvn_option]...
    ///        dvn_option = [option_size][dvn_idx][option_type][option]
    ///        option_size = len(dvn_idx) + len(option_type) + len(option)
    ///        dvn_id: uint8, dvn_idx: uint8, option_size: uint16, option_type: uint8, option: bytes
    /// @return dvnOptions the grouped options, still share the same format of _options
    /// @return dvnIndices the dvn indices
    function groupDVNOptionsByIdx(
        bytes memory _options
    ) internal pure returns (bytes[] memory dvnOptions, uint8[] memory dvnIndices) {
        if (_options.length == 0) return (dvnOptions, dvnIndices);

        uint8 numDVNs = getNumDVNs(_options);

        // if there is only 1 dvn, we can just return the whole options
        if (numDVNs == 1) {
            dvnOptions = new bytes[](1);
            dvnOptions[0] = _options;

            dvnIndices = new uint8[](1);
            dvnIndices[0] = _options.toUint8(3); // dvn idx
            return (dvnOptions, dvnIndices);
        }

        // otherwise, we need to group the options by dvn_idx
        dvnIndices = new uint8[](numDVNs);
        dvnOptions = new bytes[](numDVNs);
        unchecked {
            uint256 cursor = 0;
            uint256 start = 0;
            uint8 lastDVNIdx = 255; // 255 is an invalid dvn_idx

            while (cursor < _options.length) {
                ++cursor; // skip worker_id

                // optionLength asserted in getNumDVNs (skip check)
                uint16 optionLength = _options.toUint16(cursor);
                cursor += 2;

                // dvnIdx asserted in getNumDVNs (skip check)
                uint8 dvnIdx = _options.toUint8(cursor);

                // dvnIdx must equal to the lastDVNIdx for the first option
                // so it is always skipped in the first option
                // this operation slices out options whenever the scan finds a different lastDVNIdx
                if (lastDVNIdx == 255) {
                    lastDVNIdx = dvnIdx;
                } else if (dvnIdx != lastDVNIdx) {
                    uint256 len = cursor - start - 3; // 3 is for worker_id and option_length
                    bytes memory opt = _options.slice(start, len);
                    _insertDVNOptions(dvnOptions, dvnIndices, lastDVNIdx, opt);

                    // reset the start and lastDVNIdx
                    start += len;
                    lastDVNIdx = dvnIdx;
                }

                cursor += optionLength;
            }

            // skip check the cursor here because the cursor is asserted in getNumDVNs
            // if we have reached the end of the options, we need to process the last dvn
            uint256 size = cursor - start;
            bytes memory op = _options.slice(start, size);
            _insertDVNOptions(dvnOptions, dvnIndices, lastDVNIdx, op);

            // revert dvnIndices to start from 0
            for (uint8 i = 0; i < numDVNs; ++i) {
                --dvnIndices[i];
            }
        }
    }

    function _insertDVNOptions(
        bytes[] memory _dvnOptions,
        uint8[] memory _dvnIndices,
        uint8 _dvnIdx,
        bytes memory _newOptions
    ) internal pure {
        // dvnIdx starts from 0 but default value of dvnIndices is 0,
        // so we tell if the slot is empty by adding 1 to dvnIdx
        if (_dvnIdx == 255) revert DVN_InvalidDVNIdx();
        uint8 dvnIdxAdj = _dvnIdx + 1;

        for (uint256 j = 0; j < _dvnIndices.length; ++j) {
            uint8 index = _dvnIndices[j];
            if (dvnIdxAdj == index) {
                _dvnOptions[j] = abi.encodePacked(_dvnOptions[j], _newOptions);
                break;
            } else if (index == 0) {
                // empty slot, that means it is the first time we see this dvn
                _dvnIndices[j] = dvnIdxAdj;
                _dvnOptions[j] = _newOptions;
                break;
            }
        }
    }

    /// @dev get the number of unique dvns
    /// @param _options the format is the same as groupDVNOptionsByIdx
    function getNumDVNs(bytes memory _options) internal pure returns (uint8 numDVNs) {
        uint256 cursor = 0;
        BitMap256 bitmap;

        // find number of unique dvn_idx
        unchecked {
            while (cursor < _options.length) {
                ++cursor; // skip worker_id

                uint16 optionLength = _options.toUint16(cursor);
                cursor += 2;
                if (optionLength < 2) revert DVN_InvalidDVNOptions(cursor); // at least 1 byte for dvn_idx and 1 byte for option_type

                uint8 dvnIdx = _options.toUint8(cursor);

                // if dvnIdx is not set, increment numDVNs
                // max num of dvns is 255, 255 is an invalid dvn_idx
                // The order of the dvnIdx is not required to be sequential, as enforcing the order may weaken
                // the composability of the options. e.g. if we refrain from enforcing the order, an OApp that has
                // already enforced certain options can append additional options to the end of the enforced
                // ones without restrictions.
                if (dvnIdx == 255) revert DVN_InvalidDVNIdx();
                if (!bitmap.get(dvnIdx)) {
                    ++numDVNs;
                    bitmap = bitmap.set(dvnIdx);
                }

                cursor += optionLength;
            }
        }
        if (cursor != _options.length) revert DVN_InvalidDVNOptions(cursor);
    }

    /// @dev decode the next dvn option from _options starting from the specified cursor
    /// @param _options the format is the same as groupDVNOptionsByIdx
    /// @param _cursor the cursor to start decoding
    /// @return optionType the type of the option
    /// @return option the option
    /// @return cursor the cursor to start decoding the next option
    function nextDVNOption(
        bytes calldata _options,
        uint256 _cursor
    ) internal pure returns (uint8 optionType, bytes calldata option, uint256 cursor) {
        unchecked {
            // skip worker id
            cursor = _cursor + 1;

            // read option size
            uint16 size = _options.toU16(cursor);
            cursor += 2;

            // read option type
            optionType = _options.toU8(cursor + 1); // skip dvn_idx

            // startCursor and endCursor are used to slice the option from _options
            uint256 startCursor = cursor + 2; // skip option type and dvn_idx
            uint256 endCursor = cursor + size;
            option = _options[startCursor:endCursor];
            cursor += size;
        }
    }
}


// File @layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol@v3.0.110

// Original license: SPDX_License_Identifier: MIT

pragma solidity >=0.8.0;

struct SetConfigParam {
    uint32 eid;
    uint32 configType;
    bytes config;
}

interface IMessageLibManager {
    struct Timeout {
        address lib;
        uint256 expiry;
    }

    event LibraryRegistered(address newLib);
    event DefaultSendLibrarySet(uint32 eid, address newLib);
    event DefaultReceiveLibrarySet(uint32 eid, address newLib);
    event DefaultReceiveLibraryTimeoutSet(uint32 eid, address oldLib, uint256 expiry);
    event SendLibrarySet(address sender, uint32 eid, address newLib);
    event ReceiveLibrarySet(address receiver, uint32 eid, address newLib);
    event ReceiveLibraryTimeoutSet(address receiver, uint32 eid, address oldLib, uint256 timeout);

    function registerLibrary(address _lib) external;

    function isRegisteredLibrary(address _lib) external view returns (bool);

    function getRegisteredLibraries() external view returns (address[] memory);

    function setDefaultSendLibrary(uint32 _eid, address _newLib) external;

    function defaultSendLibrary(uint32 _eid) external view returns (address);

    function setDefaultReceiveLibrary(uint32 _eid, address _newLib, uint256 _gracePeriod) external;

    function defaultReceiveLibrary(uint32 _eid) external view returns (address);

    function setDefaultReceiveLibraryTimeout(uint32 _eid, address _lib, uint256 _expiry) external;

    function defaultReceiveLibraryTimeout(uint32 _eid) external view returns (address lib, uint256 expiry);

    function isSupportedEid(uint32 _eid) external view returns (bool);

    function isValidReceiveLibrary(address _receiver, uint32 _eid, address _lib) external view returns (bool);

    /// ------------------- OApp interfaces -------------------
    function setSendLibrary(address _oapp, uint32 _eid, address _newLib) external;

    function getSendLibrary(address _sender, uint32 _eid) external view returns (address lib);

    function isDefaultSendLibrary(address _sender, uint32 _eid) external view returns (bool);

    function setReceiveLibrary(address _oapp, uint32 _eid, address _newLib, uint256 _gracePeriod) external;

    function getReceiveLibrary(address _receiver, uint32 _eid) external view returns (address lib, bool isDefault);

    function setReceiveLibraryTimeout(address _oapp, uint32 _eid, address _lib, uint256 _expiry) external;

    function receiveLibraryTimeout(address _receiver, uint32 _eid) external view returns (address lib, uint256 expiry);

    function setConfig(address _oapp, address _lib, SetConfigParam[] calldata _params) external;

    function getConfig(
        address _oapp,
        address _lib,
        uint32 _eid,
        uint32 _configType
    ) external view returns (bytes memory config);
}


// File @layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessagingChannel.sol@v3.0.110

// Original license: SPDX_License_Identifier: MIT

pragma solidity >=0.8.0;

interface IMessagingChannel {
    event InboundNonceSkipped(uint32 srcEid, bytes32 sender, address receiver, uint64 nonce);
    event PacketNilified(uint32 srcEid, bytes32 sender, address receiver, uint64 nonce, bytes32 payloadHash);
    event PacketBurnt(uint32 srcEid, bytes32 sender, address receiver, uint64 nonce, bytes32 payloadHash);

    function eid() external view returns (uint32);

    // this is an emergency function if a message cannot be verified for some reasons
    // required to provide _nextNonce to avoid race condition
    function skip(address _oapp, uint32 _srcEid, bytes32 _sender, uint64 _nonce) external;

    function nilify(address _oapp, uint32 _srcEid, bytes32 _sender, uint64 _nonce, bytes32 _payloadHash) external;

    function burn(address _oapp, uint32 _srcEid, bytes32 _sender, uint64 _nonce, bytes32 _payloadHash) external;

    function nextGuid(address _sender, uint32 _dstEid, bytes32 _receiver) external view returns (bytes32);

    function inboundNonce(address _receiver, uint32 _srcEid, bytes32 _sender) external view returns (uint64);

    function outboundNonce(address _sender, uint32 _dstEid, bytes32 _receiver) external view returns (uint64);

    function inboundPayloadHash(
        address _receiver,
        uint32 _srcEid,
        bytes32 _sender,
        uint64 _nonce
    ) external view returns (bytes32);

    function lazyInboundNonce(address _receiver, uint32 _srcEid, bytes32 _sender) external view returns (uint64);
}


// File @layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessagingComposer.sol@v3.0.110

// Original license: SPDX_License_Identifier: MIT

pragma solidity >=0.8.0;

interface IMessagingComposer {
    event ComposeSent(address from, address to, bytes32 guid, uint16 index, bytes message);
    event ComposeDelivered(address from, address to, bytes32 guid, uint16 index);
    event LzComposeAlert(
        address indexed from,
        address indexed to,
        address indexed executor,
        bytes32 guid,
        uint16 index,
        uint256 gas,
        uint256 value,
        bytes message,
        bytes extraData,
        bytes reason
    );

    function composeQueue(
        address _from,
        address _to,
        bytes32 _guid,
        uint16 _index
    ) external view returns (bytes32 messageHash);

    function sendCompose(address _to, bytes32 _guid, uint16 _index, bytes calldata _message) external;

    function lzCompose(
        address _from,
        address _to,
        bytes32 _guid,
        uint16 _index,
        bytes calldata _message,
        bytes calldata _extraData
    ) external payable;
}


// File @layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessagingContext.sol@v3.0.110

// Original license: SPDX_License_Identifier: MIT

pragma solidity >=0.8.0;

interface IMessagingContext {
    function isSendingMessage() external view returns (bool);

    function getSendContext() external view returns (uint32 dstEid, address sender);
}


// File @layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol@v3.0.110

// Original license: SPDX_License_Identifier: MIT

pragma solidity >=0.8.0;




struct MessagingParams {
    uint32 dstEid;
    bytes32 receiver;
    bytes message;
    bytes options;
    bool payInLzToken;
}

struct MessagingReceipt {
    bytes32 guid;
    uint64 nonce;
    MessagingFee fee;
}

struct MessagingFee {
    uint256 nativeFee;
    uint256 lzTokenFee;
}

struct Origin {
    uint32 srcEid;
    bytes32 sender;
    uint64 nonce;
}

interface ILayerZeroEndpointV2 is IMessageLibManager, IMessagingComposer, IMessagingChannel, IMessagingContext {
    event PacketSent(bytes encodedPayload, bytes options, address sendLibrary);

    event PacketVerified(Origin origin, address receiver, bytes32 payloadHash);

    event PacketDelivered(Origin origin, address receiver);

    event LzReceiveAlert(
        address indexed receiver,
        address indexed executor,
        Origin origin,
        bytes32 guid,
        uint256 gas,
        uint256 value,
        bytes message,
        bytes extraData,
        bytes reason
    );

    event LzTokenSet(address token);

    event DelegateSet(address sender, address delegate);

    function quote(MessagingParams calldata _params, address _sender) external view returns (MessagingFee memory);

    function send(
        MessagingParams calldata _params,
        address _refundAddress
    ) external payable returns (MessagingReceipt memory);

    function verify(Origin calldata _origin, address _receiver, bytes32 _payloadHash) external;

    function verifiable(Origin calldata _origin, address _receiver) external view returns (bool);

    function initializable(Origin calldata _origin, address _receiver) external view returns (bool);

    function lzReceive(
        Origin calldata _origin,
        address _receiver,
        bytes32 _guid,
        bytes calldata _message,
        bytes calldata _extraData
    ) external payable;

    // oapp can burn messages partially by calling this function with its own business logic if messages are verified in order
    function clear(address _oapp, Origin calldata _origin, bytes32 _guid, bytes calldata _message) external;

    function setLzToken(address _lzToken) external;

    function lzToken() external view returns (address);

    function nativeToken() external view returns (address);

    function setDelegate(address _delegate) external;
}


// File @layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol@v0.3.2

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @title IOAppCore
 */
interface IOAppCore {
    // Custom error messages
    error OnlyPeer(uint32 eid, bytes32 sender);
    error NoPeer(uint32 eid);
    error InvalidEndpointCall();
    error InvalidDelegate();

    // Event emitted when a peer (OApp) is set for a corresponding endpoint
    event PeerSet(uint32 eid, bytes32 peer);

    /**
     * @notice Retrieves the OApp version information.
     * @return senderVersion The version of the OAppSender.sol contract.
     * @return receiverVersion The version of the OAppReceiver.sol contract.
     */
    function oAppVersion() external view returns (uint64 senderVersion, uint64 receiverVersion);

    /**
     * @notice Retrieves the LayerZero endpoint associated with the OApp.
     * @return iEndpoint The LayerZero endpoint as an interface.
     */
    function endpoint() external view returns (ILayerZeroEndpointV2 iEndpoint);

    /**
     * @notice Retrieves the peer (OApp) associated with a corresponding endpoint.
     * @param _eid The endpoint ID.
     * @return peer The peer address (OApp instance) associated with the corresponding endpoint.
     */
    function peers(uint32 _eid) external view returns (bytes32 peer);

    /**
     * @notice Sets the peer address (OApp instance) for a corresponding endpoint.
     * @param _eid The endpoint ID.
     * @param _peer The address of the peer to be associated with the corresponding endpoint.
     */
    function setPeer(uint32 _eid, bytes32 _peer) external;

    /**
     * @notice Sets the delegate address for the OApp Core.
     * @param _delegate The address of the delegate to be set.
     */
    function setDelegate(address _delegate) external;
}


// File @openzeppelin/contracts/utils/math/SafeCast.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/math/SafeCast.sol)
// This file was procedurally generated from scripts/generate/templates/SafeCast.js.

pragma solidity ^0.8.20;

/**
 * @dev Wrappers over Solidity's uintXX/intXX/bool casting operators with added overflow
 * checks.
 *
 * Downcasting from uint256/int256 in Solidity does not revert on overflow. This can
 * easily result in undesired exploitation or bugs, since developers usually
 * assume that overflows raise errors. `SafeCast` restores this intuition by
 * reverting the transaction when such an operation overflows.
 *
 * Using this library instead of the unchecked operations eliminates an entire
 * class of bugs, so it's recommended to use it always.
 */
library SafeCast {
    /**
     * @dev Value doesn't fit in an uint of `bits` size.
     */
    error SafeCastOverflowedUintDowncast(uint8 bits, uint256 value);

    /**
     * @dev An int value doesn't fit in an uint of `bits` size.
     */
    error SafeCastOverflowedIntToUint(int256 value);

    /**
     * @dev Value doesn't fit in an int of `bits` size.
     */
    error SafeCastOverflowedIntDowncast(uint8 bits, int256 value);

    /**
     * @dev An uint value doesn't fit in an int of `bits` size.
     */
    error SafeCastOverflowedUintToInt(uint256 value);

    /**
     * @dev Returns the downcasted uint248 from uint256, reverting on
     * overflow (when the input is greater than largest uint248).
     *
     * Counterpart to Solidity's `uint248` operator.
     *
     * Requirements:
     *
     * - input must fit into 248 bits
     */
    function toUint248(uint256 value) internal pure returns (uint248) {
        if (value > type(uint248).max) {
            revert SafeCastOverflowedUintDowncast(248, value);
        }
        return uint248(value);
    }

    /**
     * @dev Returns the downcasted uint240 from uint256, reverting on
     * overflow (when the input is greater than largest uint240).
     *
     * Counterpart to Solidity's `uint240` operator.
     *
     * Requirements:
     *
     * - input must fit into 240 bits
     */
    function toUint240(uint256 value) internal pure returns (uint240) {
        if (value > type(uint240).max) {
            revert SafeCastOverflowedUintDowncast(240, value);
        }
        return uint240(value);
    }

    /**
     * @dev Returns the downcasted uint232 from uint256, reverting on
     * overflow (when the input is greater than largest uint232).
     *
     * Counterpart to Solidity's `uint232` operator.
     *
     * Requirements:
     *
     * - input must fit into 232 bits
     */
    function toUint232(uint256 value) internal pure returns (uint232) {
        if (value > type(uint232).max) {
            revert SafeCastOverflowedUintDowncast(232, value);
        }
        return uint232(value);
    }

    /**
     * @dev Returns the downcasted uint224 from uint256, reverting on
     * overflow (when the input is greater than largest uint224).
     *
     * Counterpart to Solidity's `uint224` operator.
     *
     * Requirements:
     *
     * - input must fit into 224 bits
     */
    function toUint224(uint256 value) internal pure returns (uint224) {
        if (value > type(uint224).max) {
            revert SafeCastOverflowedUintDowncast(224, value);
        }
        return uint224(value);
    }

    /**
     * @dev Returns the downcasted uint216 from uint256, reverting on
     * overflow (when the input is greater than largest uint216).
     *
     * Counterpart to Solidity's `uint216` operator.
     *
     * Requirements:
     *
     * - input must fit into 216 bits
     */
    function toUint216(uint256 value) internal pure returns (uint216) {
        if (value > type(uint216).max) {
            revert SafeCastOverflowedUintDowncast(216, value);
        }
        return uint216(value);
    }

    /**
     * @dev Returns the downcasted uint208 from uint256, reverting on
     * overflow (when the input is greater than largest uint208).
     *
     * Counterpart to Solidity's `uint208` operator.
     *
     * Requirements:
     *
     * - input must fit into 208 bits
     */
    function toUint208(uint256 value) internal pure returns (uint208) {
        if (value > type(uint208).max) {
            revert SafeCastOverflowedUintDowncast(208, value);
        }
        return uint208(value);
    }

    /**
     * @dev Returns the downcasted uint200 from uint256, reverting on
     * overflow (when the input is greater than largest uint200).
     *
     * Counterpart to Solidity's `uint200` operator.
     *
     * Requirements:
     *
     * - input must fit into 200 bits
     */
    function toUint200(uint256 value) internal pure returns (uint200) {
        if (value > type(uint200).max) {
            revert SafeCastOverflowedUintDowncast(200, value);
        }
        return uint200(value);
    }

    /**
     * @dev Returns the downcasted uint192 from uint256, reverting on
     * overflow (when the input is greater than largest uint192).
     *
     * Counterpart to Solidity's `uint192` operator.
     *
     * Requirements:
     *
     * - input must fit into 192 bits
     */
    function toUint192(uint256 value) internal pure returns (uint192) {
        if (value > type(uint192).max) {
            revert SafeCastOverflowedUintDowncast(192, value);
        }
        return uint192(value);
    }

    /**
     * @dev Returns the downcasted uint184 from uint256, reverting on
     * overflow (when the input is greater than largest uint184).
     *
     * Counterpart to Solidity's `uint184` operator.
     *
     * Requirements:
     *
     * - input must fit into 184 bits
     */
    function toUint184(uint256 value) internal pure returns (uint184) {
        if (value > type(uint184).max) {
            revert SafeCastOverflowedUintDowncast(184, value);
        }
        return uint184(value);
    }

    /**
     * @dev Returns the downcasted uint176 from uint256, reverting on
     * overflow (when the input is greater than largest uint176).
     *
     * Counterpart to Solidity's `uint176` operator.
     *
     * Requirements:
     *
     * - input must fit into 176 bits
     */
    function toUint176(uint256 value) internal pure returns (uint176) {
        if (value > type(uint176).max) {
            revert SafeCastOverflowedUintDowncast(176, value);
        }
        return uint176(value);
    }

    /**
     * @dev Returns the downcasted uint168 from uint256, reverting on
     * overflow (when the input is greater than largest uint168).
     *
     * Counterpart to Solidity's `uint168` operator.
     *
     * Requirements:
     *
     * - input must fit into 168 bits
     */
    function toUint168(uint256 value) internal pure returns (uint168) {
        if (value > type(uint168).max) {
            revert SafeCastOverflowedUintDowncast(168, value);
        }
        return uint168(value);
    }

    /**
     * @dev Returns the downcasted uint160 from uint256, reverting on
     * overflow (when the input is greater than largest uint160).
     *
     * Counterpart to Solidity's `uint160` operator.
     *
     * Requirements:
     *
     * - input must fit into 160 bits
     */
    function toUint160(uint256 value) internal pure returns (uint160) {
        if (value > type(uint160).max) {
            revert SafeCastOverflowedUintDowncast(160, value);
        }
        return uint160(value);
    }

    /**
     * @dev Returns the downcasted uint152 from uint256, reverting on
     * overflow (when the input is greater than largest uint152).
     *
     * Counterpart to Solidity's `uint152` operator.
     *
     * Requirements:
     *
     * - input must fit into 152 bits
     */
    function toUint152(uint256 value) internal pure returns (uint152) {
        if (value > type(uint152).max) {
            revert SafeCastOverflowedUintDowncast(152, value);
        }
        return uint152(value);
    }

    /**
     * @dev Returns the downcasted uint144 from uint256, reverting on
     * overflow (when the input is greater than largest uint144).
     *
     * Counterpart to Solidity's `uint144` operator.
     *
     * Requirements:
     *
     * - input must fit into 144 bits
     */
    function toUint144(uint256 value) internal pure returns (uint144) {
        if (value > type(uint144).max) {
            revert SafeCastOverflowedUintDowncast(144, value);
        }
        return uint144(value);
    }

    /**
     * @dev Returns the downcasted uint136 from uint256, reverting on
     * overflow (when the input is greater than largest uint136).
     *
     * Counterpart to Solidity's `uint136` operator.
     *
     * Requirements:
     *
     * - input must fit into 136 bits
     */
    function toUint136(uint256 value) internal pure returns (uint136) {
        if (value > type(uint136).max) {
            revert SafeCastOverflowedUintDowncast(136, value);
        }
        return uint136(value);
    }

    /**
     * @dev Returns the downcasted uint128 from uint256, reverting on
     * overflow (when the input is greater than largest uint128).
     *
     * Counterpart to Solidity's `uint128` operator.
     *
     * Requirements:
     *
     * - input must fit into 128 bits
     */
    function toUint128(uint256 value) internal pure returns (uint128) {
        if (value > type(uint128).max) {
            revert SafeCastOverflowedUintDowncast(128, value);
        }
        return uint128(value);
    }

    /**
     * @dev Returns the downcasted uint120 from uint256, reverting on
     * overflow (when the input is greater than largest uint120).
     *
     * Counterpart to Solidity's `uint120` operator.
     *
     * Requirements:
     *
     * - input must fit into 120 bits
     */
    function toUint120(uint256 value) internal pure returns (uint120) {
        if (value > type(uint120).max) {
            revert SafeCastOverflowedUintDowncast(120, value);
        }
        return uint120(value);
    }

    /**
     * @dev Returns the downcasted uint112 from uint256, reverting on
     * overflow (when the input is greater than largest uint112).
     *
     * Counterpart to Solidity's `uint112` operator.
     *
     * Requirements:
     *
     * - input must fit into 112 bits
     */
    function toUint112(uint256 value) internal pure returns (uint112) {
        if (value > type(uint112).max) {
            revert SafeCastOverflowedUintDowncast(112, value);
        }
        return uint112(value);
    }

    /**
     * @dev Returns the downcasted uint104 from uint256, reverting on
     * overflow (when the input is greater than largest uint104).
     *
     * Counterpart to Solidity's `uint104` operator.
     *
     * Requirements:
     *
     * - input must fit into 104 bits
     */
    function toUint104(uint256 value) internal pure returns (uint104) {
        if (value > type(uint104).max) {
            revert SafeCastOverflowedUintDowncast(104, value);
        }
        return uint104(value);
    }

    /**
     * @dev Returns the downcasted uint96 from uint256, reverting on
     * overflow (when the input is greater than largest uint96).
     *
     * Counterpart to Solidity's `uint96` operator.
     *
     * Requirements:
     *
     * - input must fit into 96 bits
     */
    function toUint96(uint256 value) internal pure returns (uint96) {
        if (value > type(uint96).max) {
            revert SafeCastOverflowedUintDowncast(96, value);
        }
        return uint96(value);
    }

    /**
     * @dev Returns the downcasted uint88 from uint256, reverting on
     * overflow (when the input is greater than largest uint88).
     *
     * Counterpart to Solidity's `uint88` operator.
     *
     * Requirements:
     *
     * - input must fit into 88 bits
     */
    function toUint88(uint256 value) internal pure returns (uint88) {
        if (value > type(uint88).max) {
            revert SafeCastOverflowedUintDowncast(88, value);
        }
        return uint88(value);
    }

    /**
     * @dev Returns the downcasted uint80 from uint256, reverting on
     * overflow (when the input is greater than largest uint80).
     *
     * Counterpart to Solidity's `uint80` operator.
     *
     * Requirements:
     *
     * - input must fit into 80 bits
     */
    function toUint80(uint256 value) internal pure returns (uint80) {
        if (value > type(uint80).max) {
            revert SafeCastOverflowedUintDowncast(80, value);
        }
        return uint80(value);
    }

    /**
     * @dev Returns the downcasted uint72 from uint256, reverting on
     * overflow (when the input is greater than largest uint72).
     *
     * Counterpart to Solidity's `uint72` operator.
     *
     * Requirements:
     *
     * - input must fit into 72 bits
     */
    function toUint72(uint256 value) internal pure returns (uint72) {
        if (value > type(uint72).max) {
            revert SafeCastOverflowedUintDowncast(72, value);
        }
        return uint72(value);
    }

    /**
     * @dev Returns the downcasted uint64 from uint256, reverting on
     * overflow (when the input is greater than largest uint64).
     *
     * Counterpart to Solidity's `uint64` operator.
     *
     * Requirements:
     *
     * - input must fit into 64 bits
     */
    function toUint64(uint256 value) internal pure returns (uint64) {
        if (value > type(uint64).max) {
            revert SafeCastOverflowedUintDowncast(64, value);
        }
        return uint64(value);
    }

    /**
     * @dev Returns the downcasted uint56 from uint256, reverting on
     * overflow (when the input is greater than largest uint56).
     *
     * Counterpart to Solidity's `uint56` operator.
     *
     * Requirements:
     *
     * - input must fit into 56 bits
     */
    function toUint56(uint256 value) internal pure returns (uint56) {
        if (value > type(uint56).max) {
            revert SafeCastOverflowedUintDowncast(56, value);
        }
        return uint56(value);
    }

    /**
     * @dev Returns the downcasted uint48 from uint256, reverting on
     * overflow (when the input is greater than largest uint48).
     *
     * Counterpart to Solidity's `uint48` operator.
     *
     * Requirements:
     *
     * - input must fit into 48 bits
     */
    function toUint48(uint256 value) internal pure returns (uint48) {
        if (value > type(uint48).max) {
            revert SafeCastOverflowedUintDowncast(48, value);
        }
        return uint48(value);
    }

    /**
     * @dev Returns the downcasted uint40 from uint256, reverting on
     * overflow (when the input is greater than largest uint40).
     *
     * Counterpart to Solidity's `uint40` operator.
     *
     * Requirements:
     *
     * - input must fit into 40 bits
     */
    function toUint40(uint256 value) internal pure returns (uint40) {
        if (value > type(uint40).max) {
            revert SafeCastOverflowedUintDowncast(40, value);
        }
        return uint40(value);
    }

    /**
     * @dev Returns the downcasted uint32 from uint256, reverting on
     * overflow (when the input is greater than largest uint32).
     *
     * Counterpart to Solidity's `uint32` operator.
     *
     * Requirements:
     *
     * - input must fit into 32 bits
     */
    function toUint32(uint256 value) internal pure returns (uint32) {
        if (value > type(uint32).max) {
            revert SafeCastOverflowedUintDowncast(32, value);
        }
        return uint32(value);
    }

    /**
     * @dev Returns the downcasted uint24 from uint256, reverting on
     * overflow (when the input is greater than largest uint24).
     *
     * Counterpart to Solidity's `uint24` operator.
     *
     * Requirements:
     *
     * - input must fit into 24 bits
     */
    function toUint24(uint256 value) internal pure returns (uint24) {
        if (value > type(uint24).max) {
            revert SafeCastOverflowedUintDowncast(24, value);
        }
        return uint24(value);
    }

    /**
     * @dev Returns the downcasted uint16 from uint256, reverting on
     * overflow (when the input is greater than largest uint16).
     *
     * Counterpart to Solidity's `uint16` operator.
     *
     * Requirements:
     *
     * - input must fit into 16 bits
     */
    function toUint16(uint256 value) internal pure returns (uint16) {
        if (value > type(uint16).max) {
            revert SafeCastOverflowedUintDowncast(16, value);
        }
        return uint16(value);
    }

    /**
     * @dev Returns the downcasted uint8 from uint256, reverting on
     * overflow (when the input is greater than largest uint8).
     *
     * Counterpart to Solidity's `uint8` operator.
     *
     * Requirements:
     *
     * - input must fit into 8 bits
     */
    function toUint8(uint256 value) internal pure returns (uint8) {
        if (value > type(uint8).max) {
            revert SafeCastOverflowedUintDowncast(8, value);
        }
        return uint8(value);
    }

    /**
     * @dev Converts a signed int256 into an unsigned uint256.
     *
     * Requirements:
     *
     * - input must be greater than or equal to 0.
     */
    function toUint256(int256 value) internal pure returns (uint256) {
        if (value < 0) {
            revert SafeCastOverflowedIntToUint(value);
        }
        return uint256(value);
    }

    /**
     * @dev Returns the downcasted int248 from int256, reverting on
     * overflow (when the input is less than smallest int248 or
     * greater than largest int248).
     *
     * Counterpart to Solidity's `int248` operator.
     *
     * Requirements:
     *
     * - input must fit into 248 bits
     */
    function toInt248(int256 value) internal pure returns (int248 downcasted) {
        downcasted = int248(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(248, value);
        }
    }

    /**
     * @dev Returns the downcasted int240 from int256, reverting on
     * overflow (when the input is less than smallest int240 or
     * greater than largest int240).
     *
     * Counterpart to Solidity's `int240` operator.
     *
     * Requirements:
     *
     * - input must fit into 240 bits
     */
    function toInt240(int256 value) internal pure returns (int240 downcasted) {
        downcasted = int240(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(240, value);
        }
    }

    /**
     * @dev Returns the downcasted int232 from int256, reverting on
     * overflow (when the input is less than smallest int232 or
     * greater than largest int232).
     *
     * Counterpart to Solidity's `int232` operator.
     *
     * Requirements:
     *
     * - input must fit into 232 bits
     */
    function toInt232(int256 value) internal pure returns (int232 downcasted) {
        downcasted = int232(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(232, value);
        }
    }

    /**
     * @dev Returns the downcasted int224 from int256, reverting on
     * overflow (when the input is less than smallest int224 or
     * greater than largest int224).
     *
     * Counterpart to Solidity's `int224` operator.
     *
     * Requirements:
     *
     * - input must fit into 224 bits
     */
    function toInt224(int256 value) internal pure returns (int224 downcasted) {
        downcasted = int224(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(224, value);
        }
    }

    /**
     * @dev Returns the downcasted int216 from int256, reverting on
     * overflow (when the input is less than smallest int216 or
     * greater than largest int216).
     *
     * Counterpart to Solidity's `int216` operator.
     *
     * Requirements:
     *
     * - input must fit into 216 bits
     */
    function toInt216(int256 value) internal pure returns (int216 downcasted) {
        downcasted = int216(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(216, value);
        }
    }

    /**
     * @dev Returns the downcasted int208 from int256, reverting on
     * overflow (when the input is less than smallest int208 or
     * greater than largest int208).
     *
     * Counterpart to Solidity's `int208` operator.
     *
     * Requirements:
     *
     * - input must fit into 208 bits
     */
    function toInt208(int256 value) internal pure returns (int208 downcasted) {
        downcasted = int208(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(208, value);
        }
    }

    /**
     * @dev Returns the downcasted int200 from int256, reverting on
     * overflow (when the input is less than smallest int200 or
     * greater than largest int200).
     *
     * Counterpart to Solidity's `int200` operator.
     *
     * Requirements:
     *
     * - input must fit into 200 bits
     */
    function toInt200(int256 value) internal pure returns (int200 downcasted) {
        downcasted = int200(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(200, value);
        }
    }

    /**
     * @dev Returns the downcasted int192 from int256, reverting on
     * overflow (when the input is less than smallest int192 or
     * greater than largest int192).
     *
     * Counterpart to Solidity's `int192` operator.
     *
     * Requirements:
     *
     * - input must fit into 192 bits
     */
    function toInt192(int256 value) internal pure returns (int192 downcasted) {
        downcasted = int192(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(192, value);
        }
    }

    /**
     * @dev Returns the downcasted int184 from int256, reverting on
     * overflow (when the input is less than smallest int184 or
     * greater than largest int184).
     *
     * Counterpart to Solidity's `int184` operator.
     *
     * Requirements:
     *
     * - input must fit into 184 bits
     */
    function toInt184(int256 value) internal pure returns (int184 downcasted) {
        downcasted = int184(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(184, value);
        }
    }

    /**
     * @dev Returns the downcasted int176 from int256, reverting on
     * overflow (when the input is less than smallest int176 or
     * greater than largest int176).
     *
     * Counterpart to Solidity's `int176` operator.
     *
     * Requirements:
     *
     * - input must fit into 176 bits
     */
    function toInt176(int256 value) internal pure returns (int176 downcasted) {
        downcasted = int176(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(176, value);
        }
    }

    /**
     * @dev Returns the downcasted int168 from int256, reverting on
     * overflow (when the input is less than smallest int168 or
     * greater than largest int168).
     *
     * Counterpart to Solidity's `int168` operator.
     *
     * Requirements:
     *
     * - input must fit into 168 bits
     */
    function toInt168(int256 value) internal pure returns (int168 downcasted) {
        downcasted = int168(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(168, value);
        }
    }

    /**
     * @dev Returns the downcasted int160 from int256, reverting on
     * overflow (when the input is less than smallest int160 or
     * greater than largest int160).
     *
     * Counterpart to Solidity's `int160` operator.
     *
     * Requirements:
     *
     * - input must fit into 160 bits
     */
    function toInt160(int256 value) internal pure returns (int160 downcasted) {
        downcasted = int160(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(160, value);
        }
    }

    /**
     * @dev Returns the downcasted int152 from int256, reverting on
     * overflow (when the input is less than smallest int152 or
     * greater than largest int152).
     *
     * Counterpart to Solidity's `int152` operator.
     *
     * Requirements:
     *
     * - input must fit into 152 bits
     */
    function toInt152(int256 value) internal pure returns (int152 downcasted) {
        downcasted = int152(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(152, value);
        }
    }

    /**
     * @dev Returns the downcasted int144 from int256, reverting on
     * overflow (when the input is less than smallest int144 or
     * greater than largest int144).
     *
     * Counterpart to Solidity's `int144` operator.
     *
     * Requirements:
     *
     * - input must fit into 144 bits
     */
    function toInt144(int256 value) internal pure returns (int144 downcasted) {
        downcasted = int144(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(144, value);
        }
    }

    /**
     * @dev Returns the downcasted int136 from int256, reverting on
     * overflow (when the input is less than smallest int136 or
     * greater than largest int136).
     *
     * Counterpart to Solidity's `int136` operator.
     *
     * Requirements:
     *
     * - input must fit into 136 bits
     */
    function toInt136(int256 value) internal pure returns (int136 downcasted) {
        downcasted = int136(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(136, value);
        }
    }

    /**
     * @dev Returns the downcasted int128 from int256, reverting on
     * overflow (when the input is less than smallest int128 or
     * greater than largest int128).
     *
     * Counterpart to Solidity's `int128` operator.
     *
     * Requirements:
     *
     * - input must fit into 128 bits
     */
    function toInt128(int256 value) internal pure returns (int128 downcasted) {
        downcasted = int128(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(128, value);
        }
    }

    /**
     * @dev Returns the downcasted int120 from int256, reverting on
     * overflow (when the input is less than smallest int120 or
     * greater than largest int120).
     *
     * Counterpart to Solidity's `int120` operator.
     *
     * Requirements:
     *
     * - input must fit into 120 bits
     */
    function toInt120(int256 value) internal pure returns (int120 downcasted) {
        downcasted = int120(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(120, value);
        }
    }

    /**
     * @dev Returns the downcasted int112 from int256, reverting on
     * overflow (when the input is less than smallest int112 or
     * greater than largest int112).
     *
     * Counterpart to Solidity's `int112` operator.
     *
     * Requirements:
     *
     * - input must fit into 112 bits
     */
    function toInt112(int256 value) internal pure returns (int112 downcasted) {
        downcasted = int112(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(112, value);
        }
    }

    /**
     * @dev Returns the downcasted int104 from int256, reverting on
     * overflow (when the input is less than smallest int104 or
     * greater than largest int104).
     *
     * Counterpart to Solidity's `int104` operator.
     *
     * Requirements:
     *
     * - input must fit into 104 bits
     */
    function toInt104(int256 value) internal pure returns (int104 downcasted) {
        downcasted = int104(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(104, value);
        }
    }

    /**
     * @dev Returns the downcasted int96 from int256, reverting on
     * overflow (when the input is less than smallest int96 or
     * greater than largest int96).
     *
     * Counterpart to Solidity's `int96` operator.
     *
     * Requirements:
     *
     * - input must fit into 96 bits
     */
    function toInt96(int256 value) internal pure returns (int96 downcasted) {
        downcasted = int96(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(96, value);
        }
    }

    /**
     * @dev Returns the downcasted int88 from int256, reverting on
     * overflow (when the input is less than smallest int88 or
     * greater than largest int88).
     *
     * Counterpart to Solidity's `int88` operator.
     *
     * Requirements:
     *
     * - input must fit into 88 bits
     */
    function toInt88(int256 value) internal pure returns (int88 downcasted) {
        downcasted = int88(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(88, value);
        }
    }

    /**
     * @dev Returns the downcasted int80 from int256, reverting on
     * overflow (when the input is less than smallest int80 or
     * greater than largest int80).
     *
     * Counterpart to Solidity's `int80` operator.
     *
     * Requirements:
     *
     * - input must fit into 80 bits
     */
    function toInt80(int256 value) internal pure returns (int80 downcasted) {
        downcasted = int80(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(80, value);
        }
    }

    /**
     * @dev Returns the downcasted int72 from int256, reverting on
     * overflow (when the input is less than smallest int72 or
     * greater than largest int72).
     *
     * Counterpart to Solidity's `int72` operator.
     *
     * Requirements:
     *
     * - input must fit into 72 bits
     */
    function toInt72(int256 value) internal pure returns (int72 downcasted) {
        downcasted = int72(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(72, value);
        }
    }

    /**
     * @dev Returns the downcasted int64 from int256, reverting on
     * overflow (when the input is less than smallest int64 or
     * greater than largest int64).
     *
     * Counterpart to Solidity's `int64` operator.
     *
     * Requirements:
     *
     * - input must fit into 64 bits
     */
    function toInt64(int256 value) internal pure returns (int64 downcasted) {
        downcasted = int64(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(64, value);
        }
    }

    /**
     * @dev Returns the downcasted int56 from int256, reverting on
     * overflow (when the input is less than smallest int56 or
     * greater than largest int56).
     *
     * Counterpart to Solidity's `int56` operator.
     *
     * Requirements:
     *
     * - input must fit into 56 bits
     */
    function toInt56(int256 value) internal pure returns (int56 downcasted) {
        downcasted = int56(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(56, value);
        }
    }

    /**
     * @dev Returns the downcasted int48 from int256, reverting on
     * overflow (when the input is less than smallest int48 or
     * greater than largest int48).
     *
     * Counterpart to Solidity's `int48` operator.
     *
     * Requirements:
     *
     * - input must fit into 48 bits
     */
    function toInt48(int256 value) internal pure returns (int48 downcasted) {
        downcasted = int48(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(48, value);
        }
    }

    /**
     * @dev Returns the downcasted int40 from int256, reverting on
     * overflow (when the input is less than smallest int40 or
     * greater than largest int40).
     *
     * Counterpart to Solidity's `int40` operator.
     *
     * Requirements:
     *
     * - input must fit into 40 bits
     */
    function toInt40(int256 value) internal pure returns (int40 downcasted) {
        downcasted = int40(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(40, value);
        }
    }

    /**
     * @dev Returns the downcasted int32 from int256, reverting on
     * overflow (when the input is less than smallest int32 or
     * greater than largest int32).
     *
     * Counterpart to Solidity's `int32` operator.
     *
     * Requirements:
     *
     * - input must fit into 32 bits
     */
    function toInt32(int256 value) internal pure returns (int32 downcasted) {
        downcasted = int32(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(32, value);
        }
    }

    /**
     * @dev Returns the downcasted int24 from int256, reverting on
     * overflow (when the input is less than smallest int24 or
     * greater than largest int24).
     *
     * Counterpart to Solidity's `int24` operator.
     *
     * Requirements:
     *
     * - input must fit into 24 bits
     */
    function toInt24(int256 value) internal pure returns (int24 downcasted) {
        downcasted = int24(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(24, value);
        }
    }

    /**
     * @dev Returns the downcasted int16 from int256, reverting on
     * overflow (when the input is less than smallest int16 or
     * greater than largest int16).
     *
     * Counterpart to Solidity's `int16` operator.
     *
     * Requirements:
     *
     * - input must fit into 16 bits
     */
    function toInt16(int256 value) internal pure returns (int16 downcasted) {
        downcasted = int16(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(16, value);
        }
    }

    /**
     * @dev Returns the downcasted int8 from int256, reverting on
     * overflow (when the input is less than smallest int8 or
     * greater than largest int8).
     *
     * Counterpart to Solidity's `int8` operator.
     *
     * Requirements:
     *
     * - input must fit into 8 bits
     */
    function toInt8(int256 value) internal pure returns (int8 downcasted) {
        downcasted = int8(value);
        if (downcasted != value) {
            revert SafeCastOverflowedIntDowncast(8, value);
        }
    }

    /**
     * @dev Converts an unsigned uint256 into a signed int256.
     *
     * Requirements:
     *
     * - input must be less than or equal to maxInt256.
     */
    function toInt256(uint256 value) internal pure returns (int256) {
        // Note: Unsafe cast below is okay because `type(int256).max` is guaranteed to be positive
        if (value > uint256(type(int256).max)) {
            revert SafeCastOverflowedUintToInt(value);
        }
        return int256(value);
    }

    /**
     * @dev Cast a boolean (false or true) to a uint256 (0 or 1) with no jump.
     */
    function toUint(bool b) internal pure returns (uint256 u) {
        assembly ("memory-safe") {
            u := iszero(iszero(b))
        }
    }
}


// File @layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol@v0.3.2

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.20;



/**
 * @title OptionsBuilder
 * @dev Library for building and encoding various message options.
 */
library OptionsBuilder {
    using SafeCast for uint256;
    using BytesLib for bytes;

    // Constants for options types
    uint16 internal constant TYPE_1 = 1; // legacy options type 1
    uint16 internal constant TYPE_2 = 2; // legacy options type 2
    uint16 internal constant TYPE_3 = 3;

    // Custom error message
    error InvalidSize(uint256 max, uint256 actual);
    error InvalidOptionType(uint16 optionType);

    // Modifier to ensure only options of type 3 are used
    modifier onlyType3(bytes memory _options) {
        if (_options.toUint16(0) != TYPE_3) revert InvalidOptionType(_options.toUint16(0));
        _;
    }

    /**
     * @dev Creates a new options container with type 3.
     * @return options The newly created options container.
     */
    function newOptions() internal pure returns (bytes memory) {
        return abi.encodePacked(TYPE_3);
    }

    /**
     * @dev Adds an executor LZ receive option to the existing options.
     * @param _options The existing options container.
     * @param _gas The gasLimit used on the lzReceive() function in the OApp.
     * @param _value The msg.value passed to the lzReceive() function in the OApp.
     * @return options The updated options container.
     *
     * @dev When multiples of this option are added, they are summed by the executor
     * eg. if (_gas: 200k, and _value: 1 ether) AND (_gas: 100k, _value: 0.5 ether) are sent in an option to the LayerZeroEndpoint,
     * that becomes (300k, 1.5 ether) when the message is executed on the remote lzReceive() function.
     */
    function addExecutorLzReceiveOption(
        bytes memory _options,
        uint128 _gas,
        uint128 _value
    ) internal pure onlyType3(_options) returns (bytes memory) {
        bytes memory option = ExecutorOptions.encodeLzReceiveOption(_gas, _value);
        return addExecutorOption(_options, ExecutorOptions.OPTION_TYPE_LZRECEIVE, option);
    }

    /**
     * @dev Adds an executor native drop option to the existing options.
     * @param _options The existing options container.
     * @param _amount The amount for the native value that is airdropped to the 'receiver'.
     * @param _receiver The receiver address for the native drop option.
     * @return options The updated options container.
     *
     * @dev When multiples of this option are added, they are summed by the executor on the remote chain.
     */
    function addExecutorNativeDropOption(
        bytes memory _options,
        uint128 _amount,
        bytes32 _receiver
    ) internal pure onlyType3(_options) returns (bytes memory) {
        bytes memory option = ExecutorOptions.encodeNativeDropOption(_amount, _receiver);
        return addExecutorOption(_options, ExecutorOptions.OPTION_TYPE_NATIVE_DROP, option);
    }

    // /**
    //  * @dev Adds an executor native drop option to the existing options.
    //  * @param _options The existing options container.
    //  * @param _amount The amount for the native value that is airdropped to the 'receiver'.
    //  * @param _receiver The receiver address for the native drop option.
    //  * @return options The updated options container.
    //  *
    //  * @dev When multiples of this option are added, they are summed by the executor on the remote chain.
    //  */
    function addExecutorLzReadOption(
        bytes memory _options,
        uint128 _gas,
        uint32 _size,
        uint128 _value
    ) internal pure onlyType3(_options) returns (bytes memory) {
        bytes memory option = ExecutorOptions.encodeLzReadOption(_gas, _size, _value);
        return addExecutorOption(_options, ExecutorOptions.OPTION_TYPE_LZREAD, option);
    }

    /**
     * @dev Adds an executor LZ compose option to the existing options.
     * @param _options The existing options container.
     * @param _index The index for the lzCompose() function call.
     * @param _gas The gasLimit for the lzCompose() function call.
     * @param _value The msg.value for the lzCompose() function call.
     * @return options The updated options container.
     *
     * @dev When multiples of this option are added, they are summed PER index by the executor on the remote chain.
     * @dev If the OApp sends N lzCompose calls on the remote, you must provide N incremented indexes starting with 0.
     * ie. When your remote OApp composes (N = 3) messages, you must set this option for index 0,1,2
     */
    function addExecutorLzComposeOption(
        bytes memory _options,
        uint16 _index,
        uint128 _gas,
        uint128 _value
    ) internal pure onlyType3(_options) returns (bytes memory) {
        bytes memory option = ExecutorOptions.encodeLzComposeOption(_index, _gas, _value);
        return addExecutorOption(_options, ExecutorOptions.OPTION_TYPE_LZCOMPOSE, option);
    }

    /**
     * @dev Adds an executor ordered execution option to the existing options.
     * @param _options The existing options container.
     * @return options The updated options container.
     */
    function addExecutorOrderedExecutionOption(
        bytes memory _options
    ) internal pure onlyType3(_options) returns (bytes memory) {
        return addExecutorOption(_options, ExecutorOptions.OPTION_TYPE_ORDERED_EXECUTION, bytes(""));
    }

    /**
     * @dev Adds a DVN pre-crime option to the existing options.
     * @param _options The existing options container.
     * @param _dvnIdx The DVN index for the pre-crime option.
     * @return options The updated options container.
     */
    function addDVNPreCrimeOption(
        bytes memory _options,
        uint8 _dvnIdx
    ) internal pure onlyType3(_options) returns (bytes memory) {
        return addDVNOption(_options, _dvnIdx, DVNOptions.OPTION_TYPE_PRECRIME, bytes(""));
    }

    /**
     * @dev Adds an executor option to the existing options.
     * @param _options The existing options container.
     * @param _optionType The type of the executor option.
     * @param _option The encoded data for the executor option.
     * @return options The updated options container.
     */
    function addExecutorOption(
        bytes memory _options,
        uint8 _optionType,
        bytes memory _option
    ) internal pure onlyType3(_options) returns (bytes memory) {
        return
            abi.encodePacked(
                _options,
                ExecutorOptions.WORKER_ID,
                _option.length.toUint16() + 1, // +1 for optionType
                _optionType,
                _option
            );
    }

    /**
     * @dev Adds a DVN option to the existing options.
     * @param _options The existing options container.
     * @param _dvnIdx The DVN index for the DVN option.
     * @param _optionType The type of the DVN option.
     * @param _option The encoded data for the DVN option.
     * @return options The updated options container.
     */
    function addDVNOption(
        bytes memory _options,
        uint8 _dvnIdx,
        uint8 _optionType,
        bytes memory _option
    ) internal pure onlyType3(_options) returns (bytes memory) {
        return
            abi.encodePacked(
                _options,
                DVNOptions.WORKER_ID,
                _option.length.toUint16() + 2, // +2 for optionType and dvnIdx
                _dvnIdx,
                _optionType,
                _option
            );
    }

    /**
     * @dev Encodes legacy options of type 1.
     * @param _executionGas The gasLimit value passed to lzReceive().
     * @return legacyOptions The encoded legacy options.
     */
    function encodeLegacyOptionsType1(uint256 _executionGas) internal pure returns (bytes memory) {
        if (_executionGas > type(uint128).max) revert InvalidSize(type(uint128).max, _executionGas);
        return abi.encodePacked(TYPE_1, _executionGas);
    }

    /**
     * @dev Encodes legacy options of type 2.
     * @param _executionGas The gasLimit value passed to lzReceive().
     * @param _nativeForDst The amount of native air dropped to the receiver.
     * @param _receiver The _nativeForDst receiver address.
     * @return legacyOptions The encoded legacy options of type 2.
     */
    function encodeLegacyOptionsType2(
        uint256 _executionGas,
        uint256 _nativeForDst,
        bytes memory _receiver // @dev Use bytes instead of bytes32 in legacy type 2 for _receiver.
    ) internal pure returns (bytes memory) {
        if (_executionGas > type(uint128).max) revert InvalidSize(type(uint128).max, _executionGas);
        if (_nativeForDst > type(uint128).max) revert InvalidSize(type(uint128).max, _nativeForDst);
        if (_receiver.length > 32) revert InvalidSize(32, _receiver.length);
        return abi.encodePacked(TYPE_2, _executionGas, _nativeForDst, _receiver);
    }
}


// File @openzeppelin/contracts/utils/Context.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/access/Ownable.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}


// File @layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol@v0.3.2

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.20;


/**
 * @title OAppCore
 * @dev Abstract contract implementing the IOAppCore interface with basic OApp configurations.
 */
abstract contract OAppCore is IOAppCore, Ownable {
    // The LayerZero endpoint associated with the given OApp
    ILayerZeroEndpointV2 public immutable endpoint;

    // Mapping to store peers associated with corresponding endpoints
    mapping(uint32 eid => bytes32 peer) public peers;

    /**
     * @dev Constructor to initialize the OAppCore with the provided endpoint and delegate.
     * @param _endpoint The address of the LOCAL Layer Zero endpoint.
     * @param _delegate The delegate capable of making OApp configurations inside of the endpoint.
     *
     * @dev The delegate typically should be set as the owner of the contract.
     */
    constructor(address _endpoint, address _delegate) {
        endpoint = ILayerZeroEndpointV2(_endpoint);

        if (_delegate == address(0)) revert InvalidDelegate();
        endpoint.setDelegate(_delegate);
    }

    /**
     * @notice Sets the peer address (OApp instance) for a corresponding endpoint.
     * @param _eid The endpoint ID.
     * @param _peer The address of the peer to be associated with the corresponding endpoint.
     *
     * @dev Only the owner/admin of the OApp can call this function.
     * @dev Indicates that the peer is trusted to send LayerZero messages to this OApp.
     * @dev Set this to bytes32(0) to remove the peer address.
     * @dev Peer is a bytes32 to accommodate non-evm chains.
     */
    function setPeer(uint32 _eid, bytes32 _peer) public virtual onlyOwner {
        _setPeer(_eid, _peer);
    }

    /**
     * @notice Sets the peer address (OApp instance) for a corresponding endpoint.
     * @param _eid The endpoint ID.
     * @param _peer The address of the peer to be associated with the corresponding endpoint.
     *
     * @dev Indicates that the peer is trusted to send LayerZero messages to this OApp.
     * @dev Set this to bytes32(0) to remove the peer address.
     * @dev Peer is a bytes32 to accommodate non-evm chains.
     */
    function _setPeer(uint32 _eid, bytes32 _peer) internal virtual {
        peers[_eid] = _peer;
        emit PeerSet(_eid, _peer);
    }

    /**
     * @notice Internal function to get the peer address associated with a specific endpoint; reverts if NOT set.
     * ie. the peer is set to bytes32(0).
     * @param _eid The endpoint ID.
     * @return peer The address of the peer associated with the specified endpoint.
     */
    function _getPeerOrRevert(uint32 _eid) internal view virtual returns (bytes32) {
        bytes32 peer = peers[_eid];
        if (peer == bytes32(0)) revert NoPeer(_eid);
        return peer;
    }

    /**
     * @notice Sets the delegate address for the OApp.
     * @param _delegate The address of the delegate to be set.
     *
     * @dev Only the owner/admin of the OApp can call this function.
     * @dev Provides the ability for a delegate to set configs, on behalf of the OApp, directly on the Endpoint contract.
     */
    function setDelegate(address _delegate) public onlyOwner {
        endpoint.setDelegate(_delegate);
    }
}


// File @openzeppelin/contracts/utils/introspection/IERC165.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/introspection/IERC165.sol)

pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC165.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (interfaces/IERC165.sol)

pragma solidity ^0.8.20;


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/IERC20.sol)

pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC20.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (interfaces/IERC20.sol)

pragma solidity ^0.8.20;


// File @openzeppelin/contracts/interfaces/IERC1363.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (interfaces/IERC1363.sol)

pragma solidity ^0.8.20;


/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}


// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.3.0) (token/ERC20/utils/SafeERC20.sol)

pragma solidity ^0.8.20;


/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeCall(token.approve, (spender, value));

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Opposedly, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturnBool} that reverts if call fails to meet the requirements.
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            let success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            // bubble errors
            if iszero(success) {
                let ptr := mload(0x40)
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
            returnSize := returndatasize()
            returnValue := mload(0)
        }

        if (returnSize == 0 ? address(token).code.length == 0 : returnValue != 1) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silently catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            returnSize := returndatasize()
            returnValue := mload(0)
        }
        return success && (returnSize == 0 ? address(token).code.length > 0 : returnValue == 1);
    }
}


// File @layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol@v0.3.2

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.20;



/**
 * @title OAppSender
 * @dev Abstract contract implementing the OAppSender functionality for sending messages to a LayerZero endpoint.
 */
abstract contract OAppSender is OAppCore {
    using SafeERC20 for IERC20;

    // Custom error messages
    error NotEnoughNative(uint256 msgValue);
    error LzTokenUnavailable();

    // @dev The version of the OAppSender implementation.
    // @dev Version is bumped when changes are made to this contract.
    uint64 internal constant SENDER_VERSION = 1;

    /**
     * @notice Retrieves the OApp version information.
     * @return senderVersion The version of the OAppSender.sol contract.
     * @return receiverVersion The version of the OAppReceiver.sol contract.
     *
     * @dev Providing 0 as the default for OAppReceiver version. Indicates that the OAppReceiver is not implemented.
     * ie. this is a SEND only OApp.
     * @dev If the OApp uses both OAppSender and OAppReceiver, then this needs to be override returning the correct versions
     */
    function oAppVersion() public view virtual returns (uint64 senderVersion, uint64 receiverVersion) {
        return (SENDER_VERSION, 0);
    }

    /**
     * @dev Internal function to interact with the LayerZero EndpointV2.quote() for fee calculation.
     * @param _dstEid The destination endpoint ID.
     * @param _message The message payload.
     * @param _options Additional options for the message.
     * @param _payInLzToken Flag indicating whether to pay the fee in LZ tokens.
     * @return fee The calculated MessagingFee for the message.
     *      - nativeFee: The native fee for the message.
     *      - lzTokenFee: The LZ token fee for the message.
     */
    function _quote(
        uint32 _dstEid,
        bytes memory _message,
        bytes memory _options,
        bool _payInLzToken
    ) internal view virtual returns (MessagingFee memory fee) {
        return
            endpoint.quote(
                MessagingParams(_dstEid, _getPeerOrRevert(_dstEid), _message, _options, _payInLzToken),
                address(this)
            );
    }

    /**
     * @dev Internal function to interact with the LayerZero EndpointV2.send() for sending a message.
     * @param _dstEid The destination endpoint ID.
     * @param _message The message payload.
     * @param _options Additional options for the message.
     * @param _fee The calculated LayerZero fee for the message.
     *      - nativeFee: The native fee.
     *      - lzTokenFee: The lzToken fee.
     * @param _refundAddress The address to receive any excess fee values sent to the endpoint.
     * @return receipt The receipt for the sent message.
     *      - guid: The unique identifier for the sent message.
     *      - nonce: The nonce of the sent message.
     *      - fee: The LayerZero fee incurred for the message.
     */
    function _lzSend(
        uint32 _dstEid,
        bytes memory _message,
        bytes memory _options,
        MessagingFee memory _fee,
        address _refundAddress
    ) internal virtual returns (MessagingReceipt memory receipt) {
        // @dev Push corresponding fees to the endpoint, any excess is sent back to the _refundAddress from the endpoint.
        uint256 messageValue = _payNative(_fee.nativeFee);
        if (_fee.lzTokenFee > 0) _payLzToken(_fee.lzTokenFee);

        return
            // solhint-disable-next-line check-send-result
            endpoint.send{ value: messageValue }(
                MessagingParams(_dstEid, _getPeerOrRevert(_dstEid), _message, _options, _fee.lzTokenFee > 0),
                _refundAddress
            );
    }

    /**
     * @dev Internal function to pay the native fee associated with the message.
     * @param _nativeFee The native fee to be paid.
     * @return nativeFee The amount of native currency paid.
     *
     * @dev If the OApp needs to initiate MULTIPLE LayerZero messages in a single transaction,
     * this will need to be overridden because msg.value would contain multiple lzFees.
     * @dev Should be overridden in the event the LayerZero endpoint requires a different native currency.
     * @dev Some EVMs use an ERC20 as a method for paying transactions/gasFees.
     * @dev The endpoint is EITHER/OR, ie. it will NOT support both types of native payment at a time.
     */
    function _payNative(uint256 _nativeFee) internal virtual returns (uint256 nativeFee) {
        if (msg.value != _nativeFee) revert NotEnoughNative(msg.value);
        return _nativeFee;
    }

    /**
     * @dev Internal function to pay the LZ token fee associated with the message.
     * @param _lzTokenFee The LZ token fee to be paid.
     *
     * @dev If the caller is trying to pay in the specified lzToken, then the lzTokenFee is passed to the endpoint.
     * @dev Any excess sent, is passed back to the specified _refundAddress in the _lzSend().
     */
    function _payLzToken(uint256 _lzTokenFee) internal virtual {
        // @dev Cannot cache the token because it is not immutable in the endpoint.
        address lzToken = endpoint.lzToken();
        if (lzToken == address(0)) revert LzTokenUnavailable();

        // Pay LZ token fee by sending tokens to the endpoint.
        IERC20(lzToken).safeTransferFrom(msg.sender, address(endpoint), _lzTokenFee);
    }
}


// File @layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol@v3.1.4

// Original license: SPDX_License_Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @dev Struct representing token parameters for the OFT send() operation.
 */
struct SendParam {
    uint32 dstEid; // Destination endpoint ID.
    bytes32 to; // Recipient address.
    uint256 amountLD; // Amount to send in local decimals.
    uint256 minAmountLD; // Minimum amount to send in local decimals.
    bytes extraOptions; // Additional options supplied by the caller to be used in the LayerZero message.
    bytes composeMsg; // The composed message for the send() operation.
    bytes oftCmd; // The OFT command to be executed, unused in default OFT implementations.
}

/**
 * @dev Struct representing OFT limit information.
 * @dev These amounts can change dynamically and are up the specific oft implementation.
 */
struct OFTLimit {
    uint256 minAmountLD; // Minimum amount in local decimals that can be sent to the recipient.
    uint256 maxAmountLD; // Maximum amount in local decimals that can be sent to the recipient.
}

/**
 * @dev Struct representing OFT receipt information.
 */
struct OFTReceipt {
    uint256 amountSentLD; // Amount of tokens ACTUALLY debited from the sender in local decimals.
    // @dev In non-default implementations, the amountReceivedLD COULD differ from this value.
    uint256 amountReceivedLD; // Amount of tokens to be received on the remote side.
}

/**
 * @dev Struct representing OFT fee details.
 * @dev Future proof mechanism to provide a standardized way to communicate fees to things like a UI.
 */
struct OFTFeeDetail {
    int256 feeAmountLD; // Amount of the fee in local decimals.
    string description; // Description of the fee.
}

/**
 * @title IOFT
 * @dev Interface for the OftChain (OFT) token.
 * @dev Does not inherit ERC20 to accommodate usage by OFTAdapter as well.
 * @dev This specific interface ID is '0x02e49c2c'.
 */
interface IOFT {
    // Custom error messages
    error InvalidLocalDecimals();
    error SlippageExceeded(uint256 amountLD, uint256 minAmountLD);

    // Events
    event OFTSent(
        bytes32 indexed guid, // GUID of the OFT message.
        uint32 dstEid, // Destination Endpoint ID.
        address indexed fromAddress, // Address of the sender on the src chain.
        uint256 amountSentLD, // Amount of tokens sent in local decimals.
        uint256 amountReceivedLD // Amount of tokens received in local decimals.
    );
    event OFTReceived(
        bytes32 indexed guid, // GUID of the OFT message.
        uint32 srcEid, // Source Endpoint ID.
        address indexed toAddress, // Address of the recipient on the dst chain.
        uint256 amountReceivedLD // Amount of tokens received in local decimals.
    );

    /**
     * @notice Retrieves interfaceID and the version of the OFT.
     * @return interfaceId The interface ID.
     * @return version The version.
     *
     * @dev interfaceId: This specific interface ID is '0x02e49c2c'.
     * @dev version: Indicates a cross-chain compatible msg encoding with other OFTs.
     * @dev If a new feature is added to the OFT cross-chain msg encoding, the version will be incremented.
     * ie. localOFT version(x,1) CAN send messages to remoteOFT version(x,1)
     */
    function oftVersion() external view returns (bytes4 interfaceId, uint64 version);

    /**
     * @notice Retrieves the address of the token associated with the OFT.
     * @return token The address of the ERC20 token implementation.
     */
    function token() external view returns (address);

    /**
     * @notice Indicates whether the OFT contract requires approval of the 'token()' to send.
     * @return requiresApproval Needs approval of the underlying token implementation.
     *
     * @dev Allows things like wallet implementers to determine integration requirements,
     * without understanding the underlying token implementation.
     */
    function approvalRequired() external view returns (bool);

    /**
     * @notice Retrieves the shared decimals of the OFT.
     * @return sharedDecimals The shared decimals of the OFT.
     */
    function sharedDecimals() external view returns (uint8);

    /**
     * @notice Provides the fee breakdown and settings data for an OFT. Unused in the default implementation.
     * @param _sendParam The parameters for the send operation.
     * @return limit The OFT limit information.
     * @return oftFeeDetails The details of OFT fees.
     * @return receipt The OFT receipt information.
     */
    function quoteOFT(
        SendParam calldata _sendParam
    ) external view returns (OFTLimit memory, OFTFeeDetail[] memory oftFeeDetails, OFTReceipt memory);

    /**
     * @notice Provides a quote for the send() operation.
     * @param _sendParam The parameters for the send() operation.
     * @param _payInLzToken Flag indicating whether the caller is paying in the LZ token.
     * @return fee The calculated LayerZero messaging fee from the send() operation.
     *
     * @dev MessagingFee: LayerZero msg fee
     *  - nativeFee: The native fee.
     *  - lzTokenFee: The lzToken fee.
     */
    function quoteSend(SendParam calldata _sendParam, bool _payInLzToken) external view returns (MessagingFee memory);

    /**
     * @notice Executes the send() operation.
     * @param _sendParam The parameters for the send operation.
     * @param _fee The fee information supplied by the caller.
     *      - nativeFee: The native fee.
     *      - lzTokenFee: The lzToken fee.
     * @param _refundAddress The address to receive any excess funds from fees etc. on the src.
     * @return receipt The LayerZero messaging receipt from the send() operation.
     * @return oftReceipt The OFT receipt information.
     *
     * @dev MessagingReceipt: LayerZero msg receipt
     *  - guid: The unique identifier for the sent message.
     *  - nonce: The nonce of the sent message.
     *  - fee: The LayerZero fee incurred for the message.
     */
    function send(
        SendParam calldata _sendParam,
        MessagingFee calldata _fee,
        address _refundAddress
    ) external payable returns (MessagingReceipt memory, OFTReceipt memory);
}


// File @openzeppelin/contracts/utils/ReentrancyGuard.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}


// File contracts/UniversalEscrowServiceV3.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.22;






/**
 * @title IWETH
 * @notice Interface for WETH (Wrapped ETH)
 */
interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/**
 * @title IUniswapV2Router
 * @notice Simplified Uniswap V2 Router interface for token swaps
 */
interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);
    
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
}

/**
 * @title UniversalEscrowServiceV3
 * @notice Enhanced escrow service with proper chain ID mapping and fixed OFT parameters
 * @dev Fixes the chain ID vs endpoint ID mismatch issue and oftCmd parameter
 */
contract UniversalEscrowServiceV3 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using OptionsBuilder for bytes;
    
    struct EscrowDeposit {
        address buyer;
        address seller;
        address depositToken;
        uint256 depositAmount;
        uint256 netAmount;
        address targetToken;
        uint256 targetChainId;  // Now stores actual chain IDs
        bool released;
        bool conditionMet;
        uint256 timestamp;
        bytes32 transactionId;
    }
    
    // State variables
    address public serviceWallet;
    uint256 public constant SERVICE_FEE_BPS = 200; // 2%
    uint256 public constant MAX_BPS = 10000;
    uint256 public maxSlippageBps = 500; // 5% default
    
    // Chain ID mappings
    mapping(uint256 => uint32) public chainIdToEndpointId;
    mapping(uint32 => uint256) public endpointIdToChainId;
    
    // Escrow storage
    mapping(bytes32 => EscrowDeposit) public escrows;
    mapping(address => bytes32[]) public userEscrows;
    mapping(address => bool) public conditionUpdaters;
    
    // Cross-chain configuration
    mapping(uint32 => address) public oftAdapters;  // Still uses endpoint IDs for OFT
    mapping(uint32 => address) public swapComposers;
    mapping(uint32 => string) public chainNames;
    
    // External contracts
    IWETH public immutable WETH;
    IUniswapV2Router public immutable uniswapRouter;
    
    // LayerZero configuration
    uint128 public lzReceiveGas = 100000;
    uint128 public lzComposeGas = 500000;
    
    // Events
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        address depositToken,
        uint256 depositAmount,
        uint256 serviceFee,
        uint256 netAmount,
        address targetToken,
        uint256 targetChainId
    );
    
    event EscrowReleased(
        bytes32 indexed escrowId,
        address indexed seller,
        address finalToken,
        uint256 finalAmount,
        string method,
        bool withCompose
    );
    
    event ConditionUpdated(
        bytes32 indexed escrowId,
        bool conditionMet,
        address updatedBy
    );
    
    event ServiceFeeCollected(
        bytes32 indexed escrowId,
        address token,
        uint256 amount
    );
    
    event TokenSwapped(
        bytes32 indexed escrowId,
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 toAmount
    );
    
    event CrossChainTransferInitiated(
        bytes32 indexed escrowId,
        uint256 targetChainId,
        address oftAdapter,
        bytes32 guid,
        bool withCompose
    );
    
    // Errors
    error InvalidAmount();
    error InvalidRecipient();
    error EscrowNotFound();
    error EscrowAlreadyReleased();
    error ConditionNotMet();
    error UnauthorizedCaller();
    error InvalidChainId();
    error InsufficientBalance();
    error TransferFailed();
    error SwapFailed();
    error InvalidConfiguration();
    
    modifier onlyAuthorizedUpdater() {
        if (!conditionUpdaters[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }
    
    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) Ownable(msg.sender) {
        serviceWallet = _serviceWallet;
        WETH = IWETH(_weth);
        uniswapRouter = IUniswapV2Router(_uniswapRouter);
        
        // Initialize chain mappings
        _initializeChainMappings();
    }
    
    /**
     * @notice Initialize chain ID to endpoint ID mappings
     */
    function _initializeChainMappings() internal {
        // Ethereum Sepolia
        chainIdToEndpointId[11155111] = 40161;
        endpointIdToChainId[40161] = 11155111;
        
        // Polygon Amoy
        chainIdToEndpointId[80002] = 40267;
        endpointIdToChainId[40267] = 80002;
        
        // Arbitrum Sepolia
        chainIdToEndpointId[421614] = 40231;
        endpointIdToChainId[40231] = 421614;
    }
    
    /**
     * @notice Add or update chain ID mapping
     */
    function setChainMapping(uint256 chainId, uint32 endpointId) external onlyOwner {
        chainIdToEndpointId[chainId] = endpointId;
        endpointIdToChainId[endpointId] = chainId;
    }
    
    /**
     * @notice Create an escrow deposit
     * @param seller Address of the seller
     * @param depositToken Token to deposit (address(0) for ETH)
     * @param depositAmount Amount to deposit
     * @param targetToken Token seller wants to receive
     * @param targetChainId Chain where seller wants to receive (actual chain ID, not LZ endpoint)
     * @return escrowId Unique escrow identifier
     */
    function createEscrow(
        address seller,
        address depositToken,
        uint256 depositAmount,
        address targetToken,
        uint256 targetChainId  // Now expects actual chain ID
    ) external payable nonReentrant returns (bytes32 escrowId) {
        if (seller == address(0)) revert InvalidRecipient();
        if (depositAmount == 0) revert InvalidAmount();
        
        // Calculate service fee
        uint256 serviceFee = (depositAmount * SERVICE_FEE_BPS) / MAX_BPS;
        uint256 netAmount = depositAmount - serviceFee;
        
        // Generate unique escrow ID
        escrowId = keccak256(
            abi.encodePacked(
                msg.sender,
                seller,
                depositAmount,
                block.timestamp,
                block.number
            )
        );
        
        // Handle deposit based on token type
        if (depositToken == address(0)) {
            // ETH deposit
            if (msg.value != depositAmount) revert InvalidAmount();
            
            // Send service fee to service wallet
            (bool success, ) = serviceWallet.call{value: serviceFee}("");
            require(success, "Service fee transfer failed");
            
        } else {
            // ERC20 deposit
            IERC20(depositToken).safeTransferFrom(msg.sender, address(this), depositAmount);
            
            // Send service fee to service wallet
            IERC20(depositToken).safeTransfer(serviceWallet, serviceFee);
        }
        
        // Store escrow
        escrows[escrowId] = EscrowDeposit({
            buyer: msg.sender,
            seller: seller,
            depositToken: depositToken,
            depositAmount: depositAmount,
            netAmount: netAmount,
            targetToken: targetToken,
            targetChainId: targetChainId,  // Stores actual chain ID
            released: false,
            conditionMet: false,
            timestamp: block.timestamp,
            transactionId: escrowId
        });
        
        userEscrows[msg.sender].push(escrowId);
        
        emit EscrowCreated(
            escrowId,
            msg.sender,
            seller,
            depositToken,
            depositAmount,
            serviceFee,
            netAmount,
            targetToken,
            targetChainId
        );
        
        emit ServiceFeeCollected(escrowId, depositToken, serviceFee);
    }
    
    /**
     * @notice Update escrow condition status
     */
    function updateCondition(bytes32 escrowId, bool conditionMet) external onlyAuthorizedUpdater {
        EscrowDeposit storage escrow = escrows[escrowId];
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (escrow.released) revert EscrowAlreadyReleased();
        
        escrow.conditionMet = conditionMet;
        emit ConditionUpdated(escrowId, conditionMet, msg.sender);
    }
    
    /**
     * @notice Release escrow funds to seller with intelligent routing
     * @param escrowId The escrow to release
     */
    function releaseEscrow(bytes32 escrowId) external payable virtual nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        
        if (escrow.buyer == address(0)) revert EscrowNotFound();
        if (escrow.released) revert EscrowAlreadyReleased();
        if (!escrow.conditionMet) revert ConditionNotMet();
        if (msg.sender != escrow.buyer && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        
        escrow.released = true;
        
        // Determine routing strategy
        if (escrow.targetChainId != 0 && escrow.targetChainId != block.chainid) {
            // Cross-chain transfer using LayerZero
            uint32 targetEndpointId = chainIdToEndpointId[escrow.targetChainId];
            if (targetEndpointId == 0) revert InvalidChainId();
            _handleCrossChainRelease(escrowId, escrow, targetEndpointId);
        } else if (escrow.depositToken != escrow.targetToken) {
            // Same-chain token swap using Uniswap
            _handleSameChainSwap(escrowId, escrow);
        } else {
            // Direct transfer (same token, same chain)
            _handleDirectTransfer(escrowId, escrow);
        }
    }
    
    /**
     * @notice Handle direct transfer (same token, same chain)
     */
    function _handleDirectTransfer(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        if (escrow.depositToken == address(0)) {
            // ETH transfer
            (bool success, ) = escrow.seller.call{value: escrow.netAmount}("");
            require(success, "ETH transfer failed");
        } else {
            // ERC20 transfer
            IERC20(escrow.depositToken).safeTransfer(escrow.seller, escrow.netAmount);
        }
        
        emit EscrowReleased(
            escrowId,
            escrow.seller,
            escrow.depositToken,
            escrow.netAmount,
            "direct",
            false
        );
    }
    
    /**
     * @notice Handle same-chain token swap using Uniswap
     */
    function _handleSameChainSwap(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        uint256 amountOut;
        address[] memory path = new address[](2);
        
        if (escrow.depositToken == address(0)) {
            // ETH to ERC20
            path[0] = address(WETH);
            path[1] = escrow.targetToken;
            
            // Get expected output
            uint256[] memory amounts = uniswapRouter.getAmountsOut(escrow.netAmount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            // Execute swap
            uint256[] memory swapAmounts = uniswapRouter.swapExactETHForTokens{value: escrow.netAmount}(
                minAmountOut,
                path,
                escrow.seller,
                block.timestamp + 300
            );
            
            amountOut = swapAmounts[1];
            
        } else if (escrow.targetToken == address(0)) {
            // ERC20 to ETH
            path[0] = escrow.depositToken;
            path[1] = address(WETH);
            
            // Approve and get expected output
            IERC20(escrow.depositToken).safeIncreaseAllowance(address(uniswapRouter), escrow.netAmount);
            uint256[] memory amounts = uniswapRouter.getAmountsOut(escrow.netAmount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            // Execute swap
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForETH(
                escrow.netAmount,
                minAmountOut,
                path,
                escrow.seller,
                block.timestamp + 300
            );
            
            amountOut = swapAmounts[1];
            
        } else {
            // ERC20 to ERC20
            path[0] = escrow.depositToken;
            path[1] = escrow.targetToken;
            
            // Approve and get expected output
            IERC20(escrow.depositToken).safeIncreaseAllowance(address(uniswapRouter), escrow.netAmount);
            uint256[] memory amounts = uniswapRouter.getAmountsOut(escrow.netAmount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            // Execute swap
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
                escrow.netAmount,
                minAmountOut,
                path,
                escrow.seller,
                block.timestamp + 300
            );
            
            amountOut = swapAmounts[1];
        }
        
        emit TokenSwapped(escrowId, escrow.depositToken, escrow.targetToken, escrow.netAmount, amountOut);
        emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, amountOut, "uniswap", false);
    }
    
    /**
     * @notice Handle cross-chain transfer using LayerZero
     */
    function _handleCrossChainRelease(bytes32 escrowId, EscrowDeposit memory escrow, uint32 targetEndpointId) internal virtual {
        address oftAdapter = oftAdapters[targetEndpointId];
        if (oftAdapter == address(0)) revert InvalidChainId();
        
        // Convert to WETH if needed for cross-chain transfer
        uint256 bridgeAmount = escrow.netAmount;
        if (escrow.depositToken == address(0)) {
            WETH.deposit{value: escrow.netAmount}();
            bridgeAmount = escrow.netAmount;
        } else if (escrow.depositToken != address(WETH)) {
            // Swap to WETH first using Uniswap
            address[] memory path = new address[](2);
            path[0] = escrow.depositToken;
            path[1] = address(WETH);
            
            IERC20(escrow.depositToken).safeIncreaseAllowance(address(uniswapRouter), escrow.netAmount);
            
            uint256[] memory amounts = uniswapRouter.getAmountsOut(escrow.netAmount, path);
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
                escrow.netAmount,
                minAmountOut,
                path,
                address(this),
                block.timestamp + 300
            );
            
            bridgeAmount = swapAmounts[1];
        }
        
        // Check if composer is available for automatic swaps
        address composer = swapComposers[targetEndpointId];
        bool useCompose = composer != address(0) && escrow.targetToken != address(WETH);
        
        bytes memory options;
        bytes memory composeMsg = "";
        
        if (useCompose) {
            // Build compose message with swap instructions
            composeMsg = abi.encode(
                escrow.seller,
                escrow.targetToken,
                bridgeAmount,
                bridgeAmount * (MAX_BPS - maxSlippageBps) / MAX_BPS, // minAmountOut
                uint32(block.timestamp + 3600) // 1 hour deadline
            );
            
            // Build options with gas for both receive and compose
            options = OptionsBuilder.newOptions()
                .addExecutorLzReceiveOption(lzReceiveGas, 0)
                .addExecutorLzComposeOption(0, lzComposeGas, 0);
        } else {
            // Standard options without compose
            options = OptionsBuilder.newOptions()
                .addExecutorLzReceiveOption(lzReceiveGas, 0);
        }
        
        // Prepare LayerZero transfer
        bytes32 to = useCompose ? bytes32(uint256(uint160(composer))) : bytes32(uint256(uint160(escrow.seller)));
        
        SendParam memory sendParam = SendParam({
            dstEid: targetEndpointId,  // Use endpoint ID for LayerZero
            to: to,
            amountLD: bridgeAmount,
            minAmountLD: bridgeAmount * (MAX_BPS - maxSlippageBps) / MAX_BPS,
            extraOptions: options,
            composeMsg: composeMsg,
            oftCmd: hex""
        });
        
        // Approve OFT adapter
        IERC20(address(WETH)).safeIncreaseAllowance(oftAdapter, bridgeAmount);
        
        // Get quote for LayerZero fee
        MessagingFee memory fee = IOFT(oftAdapter).quoteSend(sendParam, false);
        
        // Verify msg.value covers the fee with a small buffer for gas price fluctuations
        require(msg.value >= fee.nativeFee, "Insufficient fee");
        
        // Execute cross-chain transfer
        (MessagingReceipt memory receipt, ) = IOFT(oftAdapter).send{value: fee.nativeFee}(
            sendParam,
            fee,
            payable(msg.sender) // Refund to original caller
        );
        
        emit CrossChainTransferInitiated(escrowId, escrow.targetChainId, oftAdapter, receipt.guid, useCompose);
        emit EscrowReleased(
            escrowId, 
            escrow.seller, 
            useCompose ? escrow.targetToken : address(WETH), 
            bridgeAmount, 
            useCompose ? "layerzero-compose" : "layerzero",
            useCompose
        );
    }
    
    /**
     * @notice Get escrow details
     */
    function getEscrow(bytes32 escrowId) external view returns (EscrowDeposit memory) {
        return escrows[escrowId];
    }
    
    /**
     * @notice Get user's escrow IDs
     */
    function getUserEscrows(address user) external view returns (bytes32[] memory) {
        return userEscrows[user];
    }
    
    /**
     * @notice Configure OFT adapter for a chain
     */
    function setOFTAdapter(uint32 endpointId, address adapter, string memory chainName) external onlyOwner {
        oftAdapters[endpointId] = adapter;
        chainNames[endpointId] = chainName;
    }
    
    /**
     * @notice Configure swap composer for a chain
     */
    function setSwapComposer(uint32 endpointId, address composer) external onlyOwner {
        swapComposers[endpointId] = composer;
    }
    
    /**
     * @notice Update service wallet
     */
    function setServiceWallet(address _serviceWallet) external onlyOwner {
        serviceWallet = _serviceWallet;
    }
    
    /**
     * @notice Update max slippage
     */
    function setMaxSlippage(uint256 _maxSlippageBps) external onlyOwner {
        require(_maxSlippageBps <= 1000, "Max 10% slippage"); // Max 10%
        maxSlippageBps = _maxSlippageBps;
    }
    
    /**
     * @notice Set condition updater authorization
     */
    function setConditionUpdater(address updater, bool authorized) external onlyOwner {
        conditionUpdaters[updater] = authorized;
    }
    
    /**
     * @notice Update LayerZero gas limits
     */
    function setLzGasLimits(uint128 _receiveGas, uint128 _composeGas) external onlyOwner {
        lzReceiveGas = _receiveGas;
        lzComposeGas = _composeGas;
    }
    
    /**
     * @notice Emergency withdrawal
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = owner().call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }
    
    // Receive ETH
    receive() external payable virtual {}
}


// File contracts/UniversalEscrowServiceV3StargateEnhanced.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.22;


/**
 * @title IStargateRouter
 * @notice Interface for Stargate Router
 */
interface IStargateRouter {
    struct lzTxObj {
        uint256 dstGasForCall;
        uint256 dstNativeAmount;
        bytes dstNativeAddr;
    }
    
    function swap(
        uint16 _dstChainId,
        uint256 _srcPoolId,
        uint256 _dstPoolId,
        address payable _refundAddress,
        uint256 _amountLD,
        uint256 _minAmountLD,
        lzTxObj memory _lzTxParams,
        bytes calldata _to,
        bytes calldata _payload
    ) external payable;
    
    function quoteLayerZeroFee(
        uint16 _dstChainId,
        uint8 _functionType,
        bytes calldata _toAddress,
        bytes calldata _transferAndCallPayload,
        lzTxObj memory _lzTxParams
    ) external view returns (uint256, uint256);
}

/**
 * @title IStargateRouterETH
 * @notice Interface for Stargate Router ETH
 */
interface IStargateRouterETH {
    function swapETH(
        uint16 _dstChainId,
        address payable _refundAddress,
        bytes calldata _toAddress,
        uint256 _amountLD,
        uint256 _minAmountLD
    ) external payable;
    
    function quoteLayerZeroFee(
        uint16 _dstChainId,
        bytes calldata _toAddress,
        IStargateRouter.lzTxObj memory _lzTxParams
    ) external view returns (uint256, uint256);
}

/**
 * @title UniversalEscrowServiceV3StargateEnhanced
 * @notice Enhanced escrow service with full Stargate integration for all supported tokens
 * @dev Supports ETH, USDC, USDT and other Stargate-supported assets
 */
contract UniversalEscrowServiceV3StargateEnhanced is UniversalEscrowServiceV3 {
    using SafeERC20 for IERC20;
    
    // Stargate Pool IDs
    uint256 constant STARGATE_USDC_POOL = 1;
    uint256 constant STARGATE_USDT_POOL = 2;
    uint256 constant STARGATE_ETH_POOL = 13;
    
    // Supported Stargate tokens configuration
    struct TokenConfig {
        address tokenAddress;
        uint256 poolId;
        bool isNative; // true for ETH, false for ERC20
        bool supported;
    }
    
    // Token configurations by chain
    mapping(uint256 => mapping(address => TokenConfig)) public tokenConfigs;
    
    // Stargate routers by chain
    mapping(uint256 => address) public stargateRouters;     // chainId => Router address
    mapping(uint256 => address) public stargateRouterETHs; // chainId => RouterETH address
    mapping(uint256 => uint16) public chainIdToStargateId; // chainId => Stargate chain ID
    
    // Cross-chain routing mode
    enum CrossChainMode {
        DISABLED,
        LAYERZERO_OFT,
        STARGATE
    }
    
    mapping(uint256 => CrossChainMode) public crossChainModes;
    
    // Events
    event StargateRouterSet(uint256 indexed chainId, address router, address routerETH);
    event CrossChainModeSet(uint256 indexed chainId, CrossChainMode mode);
    event TokenConfigured(uint256 indexed chainId, address indexed token, uint256 poolId, bool isNative);
    event TokenDisabled(uint256 indexed chainId, address indexed token);
    event StargateTransferInitiated(
        bytes32 indexed escrowId,
        uint16 indexed dstChainId,
        address indexed token,
        uint256 amount,
        address router
    );
    
    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) UniversalEscrowServiceV3(_serviceWallet, _weth, _uniswapRouter) {
        _initializeStargateConfig();
    }
    
    /**
     * @notice Initialize Stargate configuration for testnets
     */
    function _initializeStargateConfig() internal {
        // Sepolia (Chain ID: 11155111, Stargate ID: 10161)
        stargateRouters[11155111] = 0x2836045A50744FB50D3d04a9C8D18aD7B5012102;
        stargateRouterETHs[11155111] = 0x676Fa8D37B948236aAcE03A0b34fc0Bc37FABA8D;
        chainIdToStargateId[11155111] = 10161;
        
        // Sepolia token configurations
        tokenConfigs[11155111][address(0)] = TokenConfig({
            tokenAddress: address(0),
            poolId: STARGATE_ETH_POOL,
            isNative: true,
            supported: true
        });
        
        tokenConfigs[11155111][0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590] = TokenConfig({
            tokenAddress: 0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590, // Sepolia USDC
            poolId: STARGATE_USDC_POOL,
            isNative: false,
            supported: true
        });
        
        // Arbitrum Sepolia (Chain ID: 421614, Stargate ID: 10231)
        stargateRouters[421614] = 0x2a4C2F5ffB0E0F2dcB3f9EBBd442B8F77ECDB9Cc;
        stargateRouterETHs[421614] = 0x771A4f8a880b499A40c8fF53c7925798E0f2E594;
        chainIdToStargateId[421614] = 10231;
        
        // Arbitrum Sepolia token configurations
        tokenConfigs[421614][address(0)] = TokenConfig({
            tokenAddress: address(0),
            poolId: STARGATE_ETH_POOL,
            isNative: true,
            supported: true
        });
        
        tokenConfigs[421614][0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773] = TokenConfig({
            tokenAddress: 0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773, // Arbitrum Sepolia USDC
            poolId: STARGATE_USDC_POOL,
            isNative: false,
            supported: true
        });
        
        // Set Stargate as preferred mode for supported chains
        crossChainModes[11155111] = CrossChainMode.STARGATE;
        crossChainModes[421614] = CrossChainMode.STARGATE;
    }
    
    /**
     * @notice Enhanced release function with intelligent routing
     * @dev Automatically chooses best cross-chain method based on configuration
     */
    function releaseEscrow(bytes32 escrowId) external payable override nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        require(escrow.buyer != address(0), "Escrow not found");
        require(escrow.conditionMet, "Condition not met");
        require(!escrow.released, "Escrow already released");
        
        escrow.released = true;
        
        // Same-chain release (existing functionality)
        if (escrow.targetChainId == block.chainid) {
            _handleSameChainRelease(escrowId, escrow);
        } else {
            // Cross-chain release with intelligent routing
            _handleCrossChainReleaseEnhanced(escrowId, escrow);
        }
    }
    
    /**
     * @notice Handle same-chain release (preserves existing functionality)
     */
    function _handleSameChainRelease(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        // Same-chain, same-token: Direct transfer
        if (escrow.depositToken == escrow.targetToken) {
            if (escrow.depositToken == address(0)) {
                payable(escrow.seller).transfer(escrow.netAmount);
            } else {
                IERC20(escrow.depositToken).safeTransfer(escrow.seller, escrow.netAmount);
            }
            emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, escrow.netAmount, "direct", false);
        } 
        // Same-chain, different-token: Uniswap swap
        else {
            uint256 outputAmount = _swapToTargetToken(
                escrow.depositToken,
                escrow.targetToken,
                escrow.netAmount
            );
            
            // Transfer the swapped tokens to the seller
            if (escrow.targetToken == address(0)) {
                payable(escrow.seller).transfer(outputAmount);
            } else {
                IERC20(escrow.targetToken).safeTransfer(escrow.seller, outputAmount);
            }
            emit EscrowReleased(escrowId, escrow.seller, escrow.targetToken, outputAmount, "uniswap-swap", false);
        }
    }
    
    /**
     * @notice Enhanced cross-chain release with intelligent routing
     */
    function _handleCrossChainReleaseEnhanced(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        CrossChainMode mode = crossChainModes[escrow.targetChainId];
        
        if (mode == CrossChainMode.STARGATE) {
            _handleStargateRelease(escrowId, escrow);
        } else if (mode == CrossChainMode.LAYERZERO_OFT) {
            // Fall back to existing LayerZero OFT implementation
            uint32 targetEndpointId = chainIdToEndpointId[escrow.targetChainId];
            _handleCrossChainRelease(escrowId, escrow, targetEndpointId);
        } else {
            revert("Cross-chain mode not configured");
        }
    }
    
    /**
     * @notice Handle cross-chain release via Stargate
     */
    function _handleStargateRelease(bytes32 escrowId, EscrowDeposit memory escrow) internal {
        uint16 stargateChainId = chainIdToStargateId[escrow.targetChainId];
        require(stargateChainId != 0, "Stargate not configured for target chain");
        
        // Check if source token is supported by Stargate
        TokenConfig memory sourceTokenConfig = tokenConfigs[block.chainid][escrow.depositToken];
        TokenConfig memory targetTokenConfig = tokenConfigs[escrow.targetChainId][escrow.targetToken];
        
        // Strategy 1: Direct Stargate transfer (same token on both chains)
        if (sourceTokenConfig.supported && targetTokenConfig.supported && 
            sourceTokenConfig.poolId == targetTokenConfig.poolId) {
            _handleDirectStargateTransfer(escrowId, escrow, stargateChainId, sourceTokenConfig);
        }
        // Strategy 2: Convert to supported token then transfer
        else if (targetTokenConfig.supported) {
            _handleConvertAndStargateTransfer(escrowId, escrow, stargateChainId, targetTokenConfig);
        }
        // Strategy 3: Find best supported token for bridging
        else {
            _handleBestSupportedTokenTransfer(escrowId, escrow, stargateChainId);
        }
    }
    
    /**
     * @notice Handle direct Stargate transfer (same token on both chains)
     */
    function _handleDirectStargateTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId,
        TokenConfig memory tokenConfig
    ) internal {
        if (tokenConfig.isNative) {
            // Use RouterETH for native ETH
            _handleETHStargateTransfer(escrowId, escrow, stargateChainId);
        } else {
            // Use Router for ERC20 tokens
            _handleERC20StargateTransfer(escrowId, escrow, stargateChainId, tokenConfig);
        }
    }
    
    /**
     * @notice Handle ETH/WETH transfer via Stargate RouterETH
     */
    function _handleETHStargateTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId
    ) internal {
        address routerETH = stargateRouterETHs[block.chainid];
        require(routerETH != address(0), "RouterETH not configured");
        
        uint256 ethAmount = escrow.netAmount;
        
        // Convert source token to ETH if needed
        if (escrow.depositToken != address(0)) {
            ethAmount = _swapToTargetToken(escrow.depositToken, address(0), escrow.netAmount);
        }
        
        // Quote the LayerZero fee
        bytes memory toAddress = abi.encodePacked(escrow.seller);
        IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
            dstGasForCall: 0,
            dstNativeAmount: 0,
            dstNativeAddr: ""
        });
        
        // Use actual Stargate quote
        (uint256 fee, ) = IStargateRouterETH(routerETH).quoteLayerZeroFee(
            stargateChainId,
            toAddress,
            lzTxParams
        );
        
        // Ensure sufficient fee is provided
        require(msg.value >= fee, "Insufficient fee for Stargate transfer");
        
        // Calculate minimum amount with slippage
        uint256 minAmount = ethAmount * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        
        // Execute Stargate ETH transfer
        IStargateRouterETH(routerETH).swapETH{value: ethAmount + fee}(
            stargateChainId,
            payable(msg.sender), // refund address
            toAddress,
            ethAmount,
            minAmount
        );
        
        emit StargateTransferInitiated(escrowId, stargateChainId, address(0), ethAmount, routerETH);
        emit EscrowReleased(
            escrowId,
            escrow.seller,
            escrow.targetToken,
            ethAmount,
            "stargate-eth",
            false
        );
    }
    
    /**
     * @notice Handle ERC20 token transfer via Stargate Router
     */
    function _handleERC20StargateTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId,
        TokenConfig memory tokenConfig
    ) internal {
        address router = stargateRouters[block.chainid];
        require(router != address(0), "Stargate Router not configured");
        
        uint256 transferAmount = escrow.netAmount;
        
        // Convert source token to target Stargate token if needed
        if (escrow.depositToken != tokenConfig.tokenAddress) {
            transferAmount = _swapToTargetToken(escrow.depositToken, tokenConfig.tokenAddress, escrow.netAmount);
        }
        
        // Quote the LayerZero fee
        bytes memory toAddress = abi.encodePacked(escrow.seller);
        IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
            dstGasForCall: 0,
            dstNativeAmount: 0,
            dstNativeAddr: ""
        });
        
        // Use actual Stargate quote
        (uint256 fee, ) = IStargateRouter(router).quoteLayerZeroFee(
            stargateChainId,
            1, // TYPE_SWAP_REMOTE
            toAddress,
            "",
            lzTxParams
        );
        
        require(msg.value >= fee, "Insufficient fee for Stargate transfer");
        
        // Approve router to spend tokens
        IERC20(tokenConfig.tokenAddress).safeIncreaseAllowance(router, transferAmount);
        
        // Calculate minimum amount with slippage
        uint256 minAmount = transferAmount * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        
        // Execute Stargate swap
        IStargateRouter(router).swap{value: fee}(
            stargateChainId,
            tokenConfig.poolId,  // Source pool
            tokenConfig.poolId,  // Destination pool (same token)
            payable(msg.sender), // Refund address
            transferAmount,
            minAmount,
            lzTxParams,
            toAddress,
            ""
        );
        
        emit StargateTransferInitiated(escrowId, stargateChainId, tokenConfig.tokenAddress, transferAmount, router);
        emit EscrowReleased(
            escrowId,
            escrow.seller,
            escrow.targetToken,
            transferAmount,
            "stargate-erc20",
            false
        );
    }
    
    /**
     * @notice Handle conversion to supported token then Stargate transfer
     */
    function _handleConvertAndStargateTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId,
        TokenConfig memory targetTokenConfig
    ) internal {
        // Convert source token to target token's equivalent on source chain
        TokenConfig memory sourceEquivalentConfig = tokenConfigs[block.chainid][targetTokenConfig.tokenAddress];
        
        if (!sourceEquivalentConfig.supported) {
            // No direct equivalent, find best supported token
            _handleBestSupportedTokenTransfer(escrowId, escrow, stargateChainId);
            return;
        }
        
        // Convert source token to equivalent supported token
        uint256 convertedAmount = _swapToTargetToken(
            escrow.depositToken,
            sourceEquivalentConfig.tokenAddress,
            escrow.netAmount
        );
        
        // Create temporary escrow data for converted token
        EscrowDeposit memory convertedEscrow = EscrowDeposit({
            buyer: escrow.buyer,
            seller: escrow.seller,
            depositToken: sourceEquivalentConfig.tokenAddress,
            depositAmount: convertedAmount,
            netAmount: convertedAmount,
            targetToken: escrow.targetToken,
            targetChainId: escrow.targetChainId,
            released: false,
            conditionMet: true,
            timestamp: block.timestamp,
            transactionId: escrow.transactionId
        });
        
        // Execute Stargate transfer with converted token
        _handleDirectStargateTransfer(escrowId, convertedEscrow, stargateChainId, sourceEquivalentConfig);
    }
    
    /**
     * @notice Handle transfer using best available supported token
     */
    function _handleBestSupportedTokenTransfer(
        bytes32 escrowId,
        EscrowDeposit memory escrow,
        uint16 stargateChainId
    ) internal {
        // Priority order: ETH > USDC > USDT
        address[] memory preferredTokens = new address[](3);
        preferredTokens[0] = address(0); // ETH
        preferredTokens[1] = tokenConfigs[block.chainid][address(0)].supported ? 
            _getTokenByPoolId(block.chainid, STARGATE_USDC_POOL) : address(0);
        preferredTokens[2] = tokenConfigs[block.chainid][address(0)].supported ? 
            _getTokenByPoolId(block.chainid, STARGATE_USDT_POOL) : address(0);
        
        for (uint256 i = 0; i < preferredTokens.length; i++) {
            if (preferredTokens[i] != address(0) && 
                tokenConfigs[block.chainid][preferredTokens[i]].supported) {
                
                TokenConfig memory bridgeTokenConfig = tokenConfigs[block.chainid][preferredTokens[i]];
                
                // Convert to bridge token
                uint256 bridgeAmount = _swapToTargetToken(
                    escrow.depositToken,
                    bridgeTokenConfig.tokenAddress,
                    escrow.netAmount
                );
                
                // Create escrow for bridge token
                EscrowDeposit memory bridgeEscrow = EscrowDeposit({
                    buyer: escrow.buyer,
                    seller: escrow.seller,
                    depositToken: bridgeTokenConfig.tokenAddress,
                    depositAmount: bridgeAmount,
                    netAmount: bridgeAmount,
                    targetToken: escrow.targetToken,
                    targetChainId: escrow.targetChainId,
                    released: false,
                    conditionMet: true,
                    timestamp: block.timestamp,
                    transactionId: escrow.transactionId
                });
                
                // Execute bridge
                _handleDirectStargateTransfer(escrowId, bridgeEscrow, stargateChainId, bridgeTokenConfig);
                return;
            }
        }
        
        revert("No supported Stargate token available for bridging");
    }
    
    /**
     * @notice Get token address by pool ID on a specific chain
     */
    function _getTokenByPoolId(uint256 chainId, uint256 poolId) internal view returns (address) {
        // Check known tokens for the pool ID
        if (poolId == STARGATE_ETH_POOL) return address(0);
        
        // For Sepolia
        if (chainId == 11155111 && poolId == STARGATE_USDC_POOL) {
            return 0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590;
        }
        
        // For Arbitrum Sepolia
        if (chainId == 421614 && poolId == STARGATE_USDC_POOL) {
            return 0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773;
        }
        
        return address(0);
    }
    
    /**
     * @notice Swap any token to target token using Uniswap
     * @param fromToken Source token address
     * @param toToken Target token address  
     * @param amount Amount to swap
     * @return Amount of target token received
     */
    function _swapToTargetToken(address fromToken, address toToken, uint256 amount) internal returns (uint256) {
        if (fromToken == toToken) {
            return amount; // No swap needed
        }
        
        // Handle ETH to ERC20
        if (fromToken == address(0) && toToken != address(0)) {
            return _swapETHForTokens(toToken, amount);
        }
        
        // Handle ERC20 to ETH
        if (fromToken != address(0) && toToken == address(0)) {
            return _swapTokensForETH(fromToken, amount);
        }
        
        // Handle ERC20 to ERC20
        if (fromToken != address(0) && toToken != address(0)) {
            return _swapTokensForTokens(fromToken, toToken, amount);
        }
        
        revert("Invalid token swap combination");
    }
    
    /**
     * @notice Swap ETH for ERC20 tokens
     */
    function _swapETHForTokens(address toToken, uint256 ethAmount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = address(WETH);
        path[1] = toToken;
        
        uint256[] memory amounts = uniswapRouter.getAmountsOut(ethAmount, path);
        uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        
        uint256[] memory swapAmounts = uniswapRouter.swapExactETHForTokens{value: ethAmount}(
            minAmountOut,
            path,
            address(this),
            block.timestamp + 300
        );
        
        return swapAmounts[1];
    }
    
    /**
     * @notice Swap ERC20 tokens for ETH
     */
    function _swapTokensForETH(address fromToken, uint256 amount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = fromToken;
        path[1] = address(WETH);
        
        IERC20(fromToken).safeIncreaseAllowance(address(uniswapRouter), amount);
        
        uint256[] memory amounts = uniswapRouter.getAmountsOut(amount, path);
        uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
        
        uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForETH(
            amount,
            minAmountOut,
            path,
            address(this),
            block.timestamp + 300
        );
        
        return swapAmounts[1];
    }
    
    /**
     * @notice Swap ERC20 tokens for other ERC20 tokens
     */
    function _swapTokensForTokens(address fromToken, address toToken, uint256 amount) internal returns (uint256) {
        // Try direct path first
        address[] memory directPath = new address[](2);
        directPath[0] = fromToken;
        directPath[1] = toToken;
        
        try uniswapRouter.getAmountsOut(amount, directPath) returns (uint256[] memory amounts) {
            // Direct path exists
            IERC20(fromToken).safeIncreaseAllowance(address(uniswapRouter), amount);
            
            uint256 minAmountOut = amounts[1] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
                amount,
                minAmountOut,
                directPath,
                address(this),
                block.timestamp + 300
            );
            
            return swapAmounts[1];
        } catch {
            // No direct path, route through WETH
            address[] memory pathThroughWETH = new address[](3);
            pathThroughWETH[0] = fromToken;
            pathThroughWETH[1] = address(WETH);
            pathThroughWETH[2] = toToken;
            
            IERC20(fromToken).safeIncreaseAllowance(address(uniswapRouter), amount);
            
            uint256[] memory amounts = uniswapRouter.getAmountsOut(amount, pathThroughWETH);
            uint256 minAmountOut = amounts[2] * (MAX_BPS - maxSlippageBps) / MAX_BPS;
            
            uint256[] memory swapAmounts = uniswapRouter.swapExactTokensForTokens(
                amount,
                minAmountOut,
                pathThroughWETH,
                address(this),
                block.timestamp + 300
            );
            
            return swapAmounts[2];
        }
    }
    
    /**
     * @notice Configure Stargate token support for a specific chain
     */
    function configureStargateToken(
        uint256 chainId,
        address tokenAddress,
        uint256 poolId,
        bool isNative
    ) external onlyOwner {
        require(poolId > 0, "Invalid pool ID");
        
        tokenConfigs[chainId][tokenAddress] = TokenConfig({
            tokenAddress: tokenAddress,
            poolId: poolId,
            isNative: isNative,
            supported: true
        });
        
        emit TokenConfigured(chainId, tokenAddress, poolId, isNative);
    }
    
    /**
     * @notice Set cross-chain mode for a specific chain
     */
    function setCrossChainMode(uint256 chainId, CrossChainMode mode) external onlyOwner {
        crossChainModes[chainId] = mode;
        emit CrossChainModeSet(chainId, mode);
    }
    
    /**
     * @notice Set Stargate router addresses
     */
    function setStargateRouter(
        uint256 chainId,
        address router,
        address routerETH
    ) external onlyOwner {
        stargateRouters[chainId] = router;
        stargateRouterETHs[chainId] = routerETH;
        emit StargateRouterSet(chainId, router, routerETH);
    }
    
    /**
     * @notice Set Stargate chain ID mapping
     */
    function setStargateChainId(uint256 chainId, uint16 stargateId) external onlyOwner {
        chainIdToStargateId[chainId] = stargateId;
    }
    
    /**
     * @notice Get Stargate quote for cross-chain transfer
     */
    function getStargateQuote(
        uint256 targetChainId,
        address tokenAddress,
        uint256 amount
    ) public view returns (uint256 fee, uint256 minAmountOut) {
        uint16 stargateChainId = chainIdToStargateId[targetChainId];
        require(stargateChainId != 0, "Stargate not configured");
        
        TokenConfig memory tokenConfig = tokenConfigs[block.chainid][tokenAddress];
        require(tokenConfig.supported, "Token not supported by Stargate");
        
        // Use actual Stargate quote
        bytes memory toAddress = abi.encodePacked(msg.sender);
        IStargateRouter.lzTxObj memory lzTxParams = IStargateRouter.lzTxObj({
            dstGasForCall: 0,
            dstNativeAmount: 0,
            dstNativeAddr: ""
        });
        
        if (tokenConfig.isNative) {
            // Use RouterETH for native ETH
            address routerETH = stargateRouterETHs[block.chainid];
            require(routerETH != address(0), "RouterETH not configured");
            
            (fee, ) = IStargateRouterETH(routerETH).quoteLayerZeroFee(
                stargateChainId,
                toAddress,
                lzTxParams
            );
        } else {
            // Use Router for ERC20 tokens
            address router = stargateRouters[block.chainid];
            require(router != address(0), "Router not configured");
            
            (fee, ) = IStargateRouter(router).quoteLayerZeroFee(
                stargateChainId,
                1, // TYPE_SWAP_REMOTE
                toAddress,
                "",
                lzTxParams
            );
        }
        
        // Calculate minimum amount out with slippage
        minAmountOut = amount * (MAX_BPS - maxSlippageBps) / MAX_BPS;
    }
    
    /**
     * @notice Get Stargate quote for ETH transfer (backward compatibility)
     */
    function getStargateQuote(
        uint256 targetChainId,
        uint256 amount
    ) external view returns (uint256 fee, uint256 minAmountOut) {
        return this.getStargateQuote(targetChainId, address(0), amount);
    }
    
    /**
     * @notice Check if Stargate is available for a specific token
     */
    function isStargateAvailable(uint256 targetChainId, address tokenAddress) external view returns (bool available) {
        return chainIdToStargateId[targetChainId] != 0 && 
               tokenConfigs[targetChainId][tokenAddress].supported &&
               crossChainModes[targetChainId] == CrossChainMode.STARGATE;
    }
    
    /**
     * @notice Get supported tokens for Stargate on a specific chain
     */
    function getSupportedStargateTokens(uint256 chainId) external view returns (
        address[] memory tokens,
        TokenConfig[] memory configs
    ) {
        // Return known configured tokens
        address[] memory knownTokens = new address[](2);
        knownTokens[0] = address(0); // ETH
        
        if (chainId == 11155111) {
            knownTokens[1] = 0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590; // Sepolia USDC
        } else if (chainId == 421614) {
            knownTokens[1] = 0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773; // Arbitrum USDC
        }
        
        uint256 supportedCount = 0;
        for (uint256 i = 0; i < knownTokens.length; i++) {
            if (tokenConfigs[chainId][knownTokens[i]].supported) {
                supportedCount++;
            }
        }
        
        tokens = new address[](supportedCount);
        configs = new TokenConfig[](supportedCount);
        
        uint256 index = 0;
        for (uint256 i = 0; i < knownTokens.length; i++) {
            if (tokenConfigs[chainId][knownTokens[i]].supported) {
                tokens[index] = knownTokens[i];
                configs[index] = tokenConfigs[chainId][knownTokens[i]];
                index++;
            }
        }
    }
    
    /**
     * @notice Get token configuration
     */
    function getTokenConfig(uint256 chainId, address tokenAddress) external view returns (TokenConfig memory config) {
        return tokenConfigs[chainId][tokenAddress];
    }
    
    /**
     * @notice Get transfer options for a target chain
     */
    function getTransferOptions(uint256 targetChainId) external view returns (
        bool sameChain,
        bool hasLayerZero,
        bool hasStargate,
        CrossChainMode preferredMode
    ) {
        sameChain = (targetChainId == block.chainid);
        hasLayerZero = (chainIdToEndpointId[targetChainId] != 0);
        hasStargate = (chainIdToStargateId[targetChainId] != 0);
        preferredMode = crossChainModes[targetChainId];
    }
    
    /**
     * @notice Emergency function to disable Stargate for a chain
     */
    function disableStargate(uint256 chainId) external onlyOwner {
        crossChainModes[chainId] = CrossChainMode.DISABLED;
        emit CrossChainModeSet(chainId, CrossChainMode.DISABLED);
    }
    
    /**
     * @notice Receive ETH for WETH unwrapping and swaps
     */
    receive() external payable override {
        // Allow receiving ETH from WETH contract and Uniswap
    }
}


// File contracts/UniversalEscrowServiceV3Disputes.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title UniversalEscrowServiceV3Disputes
 * @notice Enhanced escrow service with dispute resolution mechanism
 * @dev Adds 48-hour dispute window and 7-day resolution period
 */
contract UniversalEscrowServiceV3Disputes is UniversalEscrowServiceV3StargateEnhanced {
    using SafeERC20 for IERC20;
    
    // Dispute constants
    uint256 public constant DISPUTE_WINDOW = 48 hours;
    uint256 public constant DISPUTE_RESOLUTION_PERIOD = 7 days;
    
    // Production mode flag
    bool public productionMode = false;
    
    // Enhanced escrow structure with dispute fields
    struct DisputeInfo {
        uint256 conditionMetTimestamp;
        bool disputeRaised;
        address disputeRaisedBy;
        uint256 disputeRaisedTimestamp;
        bool disputeResolved;
        string disputeReason;
    }
    
    // Dispute storage
    mapping(bytes32 => DisputeInfo) public disputes;
    
    // Events
    event DisputeRaised(
        bytes32 indexed escrowId, 
        address indexed raisedBy, 
        string reason,
        uint256 timestamp
    );
    event DisputeResolved(
        bytes32 indexed escrowId, 
        bool releasedToSeller,
        uint256 timestamp
    );
    event AutomaticRelease(
        bytes32 indexed escrowId,
        uint256 timestamp
    );
    event FundsReturnedToBuyer(
        bytes32 indexed escrowId,
        address indexed buyer,
        uint256 amount,
        string reason
    );
    
    // Modifiers
    modifier onlyServiceWallet() {
        require(msg.sender == serviceWallet, "Only service wallet");
        _;
    }

    constructor(
        address _serviceWallet,
        address _weth,
        address _uniswapRouter
    ) UniversalEscrowServiceV3StargateEnhanced(_serviceWallet, _weth, _uniswapRouter) {}
    
    /**
     * @notice Update condition status with timestamp tracking
     * @param escrowId The escrow ID
     * @param conditionMet Whether the condition is met
     */
    function updateConditionWithDispute(bytes32 escrowId, bool conditionMet) external onlyServiceWallet {
        EscrowDeposit storage escrow = escrows[escrowId];
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        
        escrow.conditionMet = conditionMet;
        
        // Track when conditions were first met
        if (conditionMet && disputes[escrowId].conditionMetTimestamp == 0) {
            disputes[escrowId].conditionMetTimestamp = block.timestamp;
        }
        
        emit ConditionUpdated(escrowId, conditionMet, msg.sender);
    }
    
    /**
     * @notice Raise a dispute within 48 hours of conditions being met
     * @param escrowId The escrow ID
     * @param reason The reason for dispute
     */
    function raiseDispute(bytes32 escrowId, string calldata reason) external {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        require(escrow.conditionMet, "Conditions not met yet");
        require(!dispute.disputeRaised, "Dispute already raised");
        
        // Only buyer or seller can raise dispute
        require(
            msg.sender == escrow.buyer || msg.sender == escrow.seller,
            "Only buyer or seller can raise dispute"
        );
        
        // Must be within dispute window
        require(
            block.timestamp <= dispute.conditionMetTimestamp + DISPUTE_WINDOW,
            "Dispute window has passed"
        );
        
        dispute.disputeRaised = true;
        dispute.disputeRaisedBy = msg.sender;
        dispute.disputeRaisedTimestamp = block.timestamp;
        dispute.disputeReason = reason;
        
        emit DisputeRaised(escrowId, msg.sender, reason, block.timestamp);
    }
    
    /**
     * @notice Resolve a dispute (only buyer and seller together)
     * @param escrowId The escrow ID
     * @param releaseFunds Whether to release funds to seller (true) or return to buyer (false)
     */
    function resolveDispute(bytes32 escrowId, bool releaseFunds) external {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        require(dispute.disputeRaised, "No dispute to resolve");
        require(!dispute.disputeResolved, "Dispute already resolved");
        
        // For now, only service wallet can resolve disputes
        // In production, this could be an arbiter or require both parties' signatures
        require(msg.sender == serviceWallet, "Only service wallet can resolve disputes");
        
        dispute.disputeResolved = true;
        
        if (releaseFunds) {
            // Release to seller using optimal mechanism
            _releaseEscrowWithDispute(escrowId);
        } else {
            // Return funds to buyer
            _returnFundsToBuyer(escrowId);
        }
        
        emit DisputeResolved(escrowId, releaseFunds, block.timestamp);
    }
    
    /**
     * @notice Enhanced release function that checks dispute status
     */
    function releaseEscrowWithDisputeCheck(bytes32 escrowId) external payable nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(escrow.conditionMet, "Condition not met");
        require(!escrow.released, "Escrow already released");
        
        // Check dispute status
        if (dispute.disputeRaised) {
            require(dispute.disputeResolved, "Dispute not resolved");
            // If dispute was resolved in favor of buyer, funds should have been returned
            require(
                dispute.disputeRaisedTimestamp + DISPUTE_RESOLUTION_PERIOD < block.timestamp,
                "Dispute resolution period not ended"
            );
        } else {
            // No dispute raised - check if dispute window has passed
            require(
                dispute.conditionMetTimestamp > 0,
                "Condition met timestamp not set"
            );
            require(
                block.timestamp > dispute.conditionMetTimestamp + DISPUTE_WINDOW,
                "Dispute window still active"
            );
        }
        
        // Mark as released
        escrow.released = true;
        
        // Proceed with normal release logic
        if (escrow.targetChainId == block.chainid) {
            _handleSameChainRelease(escrowId, escrow);
        } else {
            _handleCrossChainReleaseEnhanced(escrowId, escrow);
        }
        
        emit AutomaticRelease(escrowId, block.timestamp);
    }
    
    /**
     * @notice Check if escrow can be released (considering dispute window)
     */
    function canReleaseEscrow(bytes32 escrowId) external view returns (
        bool canRelease,
        string memory reason
    ) {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        if (escrow.buyer == address(0)) {
            return (false, "Escrow not found");
        }
        
        if (!escrow.conditionMet) {
            return (false, "Conditions not met");
        }
        
        if (escrow.released) {
            return (false, "Already released");
        }
        
        if (dispute.disputeRaised && !dispute.disputeResolved) {
            return (false, "Dispute pending resolution");
        }
        
        if (dispute.conditionMetTimestamp == 0) {
            return (false, "Condition met timestamp not set");
        }
        
        if (block.timestamp <= dispute.conditionMetTimestamp + DISPUTE_WINDOW) {
            uint256 remainingTime = (dispute.conditionMetTimestamp + DISPUTE_WINDOW) - block.timestamp;
            return (false, string(abi.encodePacked("Dispute window active: ", _toString(remainingTime), " seconds remaining")));
        }
        
        return (true, "Can release");
    }
    
    /**
     * @notice Return funds to buyer (in case of unresolved dispute)
     */
    function returnFundsAfterDisputeTimeout(bytes32 escrowId) external nonReentrant {
        EscrowDeposit storage escrow = escrows[escrowId];
        DisputeInfo storage dispute = disputes[escrowId];
        
        require(escrow.buyer != address(0), "Escrow not found");
        require(!escrow.released, "Escrow already released");
        require(dispute.disputeRaised, "No dispute raised");
        require(!dispute.disputeResolved, "Dispute already resolved");
        
        // Check if resolution period has passed
        require(
            block.timestamp > dispute.disputeRaisedTimestamp + DISPUTE_RESOLUTION_PERIOD,
            "Dispute resolution period not ended"
        );
        
        _returnFundsToBuyer(escrowId);
    }
    
    /**
     * @notice Internal function to return funds to buyer
     */
    function _returnFundsToBuyer(bytes32 escrowId) internal {
        EscrowDeposit storage escrow = escrows[escrowId];
        escrow.released = true;
        
        // Return the full deposit amount (including service fee) to buyer
        uint256 returnAmount = escrow.depositAmount;
        
        if (escrow.depositToken == address(0)) {
            // Return ETH
            payable(escrow.buyer).transfer(returnAmount);
        } else {
            // Return ERC20 tokens
            IERC20(escrow.depositToken).safeTransfer(escrow.buyer, returnAmount);
        }
        
        emit FundsReturnedToBuyer(
            escrowId, 
            escrow.buyer, 
            returnAmount, 
            "Dispute unresolved or resolved in buyer favor"
        );
    }
    
    /**
     * @notice Internal function to release after dispute resolution
     */
    function _releaseEscrowWithDispute(bytes32 escrowId) internal {
        EscrowDeposit storage escrow = escrows[escrowId];
        escrow.released = true;
        
        // Proceed with normal release logic
        if (escrow.targetChainId == block.chainid) {
            _handleSameChainRelease(escrowId, escrow);
        } else {
            _handleCrossChainReleaseEnhanced(escrowId, escrow);
        }
    }
    
    /**
     * @notice Get dispute information
     */
    function getDisputeInfo(bytes32 escrowId) external view returns (
        bool disputeRaised,
        address disputeRaisedBy,
        uint256 disputeRaisedTimestamp,
        bool disputeResolved,
        string memory disputeReason,
        uint256 conditionMetTimestamp
    ) {
        DisputeInfo storage dispute = disputes[escrowId];
        return (
            dispute.disputeRaised,
            dispute.disputeRaisedBy,
            dispute.disputeRaisedTimestamp,
            dispute.disputeResolved,
            dispute.disputeReason,
            dispute.conditionMetTimestamp
        );
    }
    
    /**
     * @notice Helper function to convert uint to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
