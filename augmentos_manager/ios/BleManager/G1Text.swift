//
//  G1Text.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//


import Foundation
import CoreGraphics

class G1Text {
    // Constants for text wall display
    private static let TEXT_COMMAND: UInt8 = 0x4E  // Text command
    private static let DISPLAY_WIDTH = 488
    private static let DISPLAY_USE_WIDTH = 488  // How much of the display to use
    private static let FONT_MULTIPLIER: Float = 1/50.0
    private static let OLD_FONT_SIZE = 21      // Font size
    private static let FONT_DIVIDER: Float = 2.0
    private static let LINES_PER_SCREEN = 5 // Lines per screen
    private static let MAX_CHUNK_SIZE = 176 // Maximum chunk size for BLE packets
    
    private var textSeqNum = 0 // Sequence number for text packets
    private var fontLoader = G1FontLoader()
    
    init() {
    }
    
    // MARK: - Text Wall Methods
    
//    func displayTextWall(_ text: String) {
//        let chunks = createTextWallChunks(text)
//        sendChunks(chunks)
//    }
    
//    func displayDoubleTextWall(textTop: String, textBottom: String) {
//        let chunks = createDoubleTextWallChunks(textTop: textTop, textBottom: textBottom)
//        sendChunks(chunks)
//    }
    
    func createTextWallChunks(_ text: String) -> [[UInt8]] {
        let margin = 5
        
        // Get width of single space character
        let spaceWidth = calculateTextWidth(" ")
        
        // Calculate effective display width after accounting for left and right margins in spaces
        let marginWidth = margin * spaceWidth // Width of left margin in pixels
        let effectiveWidth = G1Text.DISPLAY_WIDTH - (2 * marginWidth) // Subtract left and right margins
        
        // Split text into lines based on effective display width
        let lines = splitIntoLines(text, maxDisplayWidth: effectiveWidth)
        
        // Calculate total pages (hard set to 1 - 1PAGECHANGE)
        let totalPages = 1
        
        var allChunks = [[UInt8]]()
        
        // Process each page
        for page in 0..<totalPages {
            // Get lines for current page
            let startLine = page * G1Text.LINES_PER_SCREEN
            let endLine = min(startLine + G1Text.LINES_PER_SCREEN, lines.count)
            let pageLines = Array(lines[startLine..<endLine])
            
            // Combine lines for this page with proper indentation
            var pageText = ""
            
            for line in pageLines {
                // Add the exact number of spaces for indentation
                let indentation = String(repeating: " ", count: margin)
                pageText.append("\(indentation)\(line)\n")
            }
            
            guard let textData = pageText.data(using: .utf8) else { continue }
            let textBytes = [UInt8](textData)
            let totalChunks = Int(ceil(Double(textBytes.count) / Double(G1Text.MAX_CHUNK_SIZE)))
            
            // Create chunks for this page
            for i in 0..<totalChunks {
                let start = i * G1Text.MAX_CHUNK_SIZE
                let end = min(start + G1Text.MAX_CHUNK_SIZE, textBytes.count)
                let payloadChunk = Array(textBytes[start..<end])
                
                // Create header with protocol specifications
                let screenStatus: UInt8 = 0x71 // New content (0x01) + Text Show (0x70)
                let header: [UInt8] = [
                    G1Text.TEXT_COMMAND,    // Command type
                    UInt8(textSeqNum),      // Sequence number
                    UInt8(totalChunks),     // Total packages
                    UInt8(i),               // Current package number
                    screenStatus,           // Screen status
                    0x00,                   // new_char_pos0 (high)
                    0x00,                   // new_char_pos1 (low)
                    UInt8(page),            // Current page number
                    UInt8(totalPages)       // Max page number
                ]
                
                // Combine header and payload
                var chunk = header
                chunk.append(contentsOf: payloadChunk)
                
                allChunks.append(chunk)
            }
            
            // Increment sequence number for next page
            textSeqNum = (textSeqNum + 1) % 256
            break // Hard set to 1 - 1PAGECHANGE
        }
        
        return allChunks
    }
    
    public func createDoubleTextWallChunks(textTop: String, textBottom: String) -> [[UInt8]] {
        print("Creating double text wall chunks... \(textTop), \(textBottom)")
        // Define column widths and positions
        let LEFT_COLUMN_WIDTH = Int(Double(G1Text.DISPLAY_WIDTH) * 0.5)  // 50% of display for left column
        let RIGHT_COLUMN_START = Int(Double(G1Text.DISPLAY_WIDTH) * 0.6)  // Right column starts at 60%
        
        // Split texts into lines with specific width constraints
        var lines1 = splitIntoLines(textTop, maxDisplayWidth: LEFT_COLUMN_WIDTH)
        var lines2 = splitIntoLines(textBottom, maxDisplayWidth: G1Text.DISPLAY_WIDTH - RIGHT_COLUMN_START)
        
        // Ensure we have exactly LINES_PER_SCREEN lines (typically 5)
        while lines1.count < G1Text.LINES_PER_SCREEN { lines1.append("") }
        while lines2.count < G1Text.LINES_PER_SCREEN { lines2.append("") }
        
        lines1 = Array(lines1.prefix(G1Text.LINES_PER_SCREEN))
        lines2 = Array(lines2.prefix(G1Text.LINES_PER_SCREEN))

        print("Lines1: \(lines1)")
        print("Lines2: \(lines2)")
        
        // Get precise space width
        let spaceWidth = calculateTextWidth(" ")
        
        // Construct the text output by merging the lines with precise positioning
        var pageText = ""
        for i in 0..<G1Text.LINES_PER_SCREEN {
            let leftText = lines1[i].replacingOccurrences(of: "\u{2002}", with: "") // Drop enspaces
            let rightText = lines2[i].replacingOccurrences(of: "\u{2002}", with: "")
            
            // Calculate width of left text in pixels
            let leftTextWidth = calculateTextWidth(leftText)
            
            // Calculate exactly how many spaces are needed to position the right column correctly
            let spacesNeeded = calculateSpacesForAlignment(
                currentWidth: leftTextWidth,
                targetPosition: RIGHT_COLUMN_START,
                spaceWidth: spaceWidth
            )
            
            // Log detailed alignment info for debugging
            print("Line \(i): Left='\(leftText)' (width=\(leftTextWidth)px) | Spaces=\(spacesNeeded) | Right='\(rightText)'")
            
            // Construct the full line with precise alignment
            pageText.append(leftText)
            pageText.append(String(repeating: " ", count: spacesNeeded))
            pageText.append(rightText)
            pageText.append("\n")
        }

        print("Page Text: \(pageText)")
        
        // Convert to bytes and chunk for transmission
        return chunkTextForTransmission(pageText)
    }
    
    private func chunkTextForTransmission(_ text: String) -> [[UInt8]] {
        guard let textData = text.data(using: .utf8) else { return [] }
        let textBytes = [UInt8](textData)
        let totalChunks = Int(ceil(Double(textBytes.count) / Double(G1Text.MAX_CHUNK_SIZE)))
        
        var allChunks = [[UInt8]]()
        for i in 0..<totalChunks {
            let start = i * G1Text.MAX_CHUNK_SIZE
            let end = min(start + G1Text.MAX_CHUNK_SIZE, textBytes.count)
            let payloadChunk = Array(textBytes[start..<end])
            
            // Create header with protocol specifications
            let screenStatus: UInt8 = 0x71 // New content (0x01) + Text Show (0x70)
            let header: [UInt8] = [
                G1Text.TEXT_COMMAND,    // Command type
                UInt8(textSeqNum),      // Sequence number
                UInt8(totalChunks),     // Total packages
                UInt8(i),               // Current package number
                screenStatus,           // Screen status
                0x00,                   // new_char_pos0 (high)
                0x00,                   // new_char_pos1 (low)
                0x00,                   // Current page number (always 0 for now)
                0x01                    // Max page number (always 1)
            ]
            
            // Combine header and payload
            var chunk = header
            chunk.append(contentsOf: payloadChunk)
            
            allChunks.append(chunk)
        }
        
        // Increment sequence number for next page
        textSeqNum = (textSeqNum + 1) % 256
        
        return allChunks
    }
    
    private func calculateTextWidth(_ text: String) -> Int {
        var width = 0
        for char in text {
            let glyph = fontLoader.getGlyph(char)
            width += glyph.width + 1 // Add 1 pixel per character for spacing
        }
        return width * 2
    }
    
    private func calculateSubstringWidth(_ text: String, start: Int, end: Int) -> Int {
        let startIndex = text.index(text.startIndex, offsetBy: start)
        let endIndex = text.index(text.startIndex, offsetBy: end)
        let substring = text[startIndex..<endIndex]
        return calculateTextWidth(String(substring))
    }
    
    private func calculateSpacesForAlignment(currentWidth: Int, targetPosition: Int, spaceWidth: Int) -> Int {
        // Calculate space needed in pixels
        let pixelsNeeded = targetPosition - currentWidth
        
        // Calculate spaces needed (with minimum of 1 space for separation)
        if pixelsNeeded <= 0 {
            return 1 // Ensure at least one space between columns
        }
        
        // Calculate the exact number of spaces needed
        let spaces = Int(ceil(Double(pixelsNeeded) / Double(spaceWidth)))
        
        // Cap at a reasonable maximum
        return min(spaces, 100)
    }
    
    private func splitIntoLines(_ text: String, maxDisplayWidth: Int) -> [String] {
        // Replace specific symbols
        let processedText = text.replacingOccurrences(of: "⬆", with: "^").replacingOccurrences(of: "⟶", with: "-")
        
        var lines = [String]()
        
        // Handle empty or single space case
        if processedText.isEmpty || processedText == " " {
            lines.append(processedText)
            return lines
        }
        
        // Split by newlines first
        let rawLines = processedText.components(separatedBy: "\n")
        
        print("Splitting text into lines...\(rawLines)")
        
        for rawLine in rawLines {
            // Add empty lines for newlines
            if rawLine.isEmpty {
                lines.append("")
                continue
            }
            
            let lineLength = rawLine.count
            var startIndex = 0
            
            while startIndex < lineLength {
                // Get maximum possible end index
                let endIndex = lineLength
                
                // Calculate width of the entire remaining text
                let lineWidth = calculateSubstringWidth(rawLine, start: startIndex, end: endIndex)
                
                print("Line length: \(rawLine)")
                print("Calculating line width: \(lineWidth)")
                
                // If entire line fits, add it and move to next line
                if lineWidth <= maxDisplayWidth {
                    let startIndexChar = rawLine.index(rawLine.startIndex, offsetBy: startIndex)
                    lines.append(String(rawLine[startIndexChar...]))
                    break
                }
                
                // Binary search to find the maximum number of characters that fit
                var left = startIndex + 1
                var right = lineLength
                var bestSplitIndex = startIndex + 1
                
                while left <= right {
                    let mid = left + (right - left) / 2
                    let width = calculateSubstringWidth(rawLine, start: startIndex, end: mid)
                    
                    if width <= maxDisplayWidth {
                        bestSplitIndex = mid
                        left = mid + 1
                    } else {
                        right = mid - 1
                    }
                }
                
                // Now find a good place to break (preferably at a space)
                var splitIndex = bestSplitIndex
                
                // Look for a space to break at
                var foundSpace = false
                for i in (startIndex+1...bestSplitIndex).reversed() {
                    if i > 0 && rawLine[rawLine.index(rawLine.startIndex, offsetBy: i-1)] == " " {
                        splitIndex = i
                        foundSpace = true
                        break
                    }
                }
                
                // If we couldn't find a space in a reasonable range, use the calculated split point
                if !foundSpace && bestSplitIndex - startIndex > 2 {
                    splitIndex = bestSplitIndex
                }
                
                // Add the line
                let startChar = rawLine.index(rawLine.startIndex, offsetBy: startIndex)
                let endChar = rawLine.index(rawLine.startIndex, offsetBy: splitIndex)
                let line = String(rawLine[startChar..<endChar]).trimmingCharacters(in: .whitespaces)
                lines.append(line)
                
                // Skip any spaces at the beginning of the next line
                while splitIndex < lineLength && rawLine[rawLine.index(rawLine.startIndex, offsetBy: splitIndex)] == " " {
                    splitIndex += 1
                }
                
                startIndex = splitIndex
            }
        }
        
        return lines
    }
}

class G1FontLoader {
    private var fontMap: [Character: FontGlyph] = [:]
    
    init() {
        // Initialize with hardcoded font data instead of loading from file
        loadHardcodedFontData()
    }
    
    private func loadHardcodedFontData() {
        // Hardcoded font data based on the JSON snippet
        let hardcodedGlyphs: [[String: Any]] = [
          [
            "code_point": 32,
            "char": " ",
            "width": 2,
            "height": 26
          ],
          [
            "code_point": 65,
            "char": "A",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 66,
            "char": "B",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 67,
            "char": "C",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 68,
            "char": "D",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 69,
            "char": "E",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 70,
            "char": "F",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 71,
            "char": "G",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 72,
            "char": "H",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 73,
            "char": "I",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 74,
            "char": "J",
            "width": 4,
            "height": 26
          ],
          [
            "code_point": 75,
            "char": "K",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 76,
            "char": "L",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 77,
            "char": "M",
            "width": 7,
            "height": 26
          ],
          [
            "code_point": 78,
            "char": "N",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 79,
            "char": "O",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 80,
            "char": "P",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 81,
            "char": "Q",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 82,
            "char": "R",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 83,
            "char": "S",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 84,
            "char": "T",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 85,
            "char": "U",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 86,
            "char": "V",
            "width": 7,
            "height": 26
          ],
          [
            "code_point": 87,
            "char": "W",
            "width": 7,
            "height": 26
          ],
          [
            "code_point": 88,
            "char": "X",
            "width": 7,
            "height": 26
          ],
          [
            "code_point": 89,
            "char": "Y",
            "width": 7,
            "height": 26
          ],
          [
            "code_point": 90,
            "char": "Z",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 97,
            "char": "a",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 98,
            "char": "b",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 99,
            "char": "c",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 100,
            "char": "d",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 101,
            "char": "e",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 102,
            "char": "f",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 103,
            "char": "g",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 104,
            "char": "h",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 105,
            "char": "i",
            "width": 1,
            "height": 26
          ],
          [
            "code_point": 106,
            "char": "j",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 107,
            "char": "k",
            "width": 4,
            "height": 26
          ],
          [
            "code_point": 108,
            "char": "l",
            "width": 2,
            "height": 26
          ],
          [
            "code_point": 109,
            "char": "m",
            "width": 7,
            "height": 26
          ],
          [
            "code_point": 110,
            "char": "n",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 111,
            "char": "o",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 112,
            "char": "p",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 113,
            "char": "q",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 114,
            "char": "r",
            "width": 4,
            "height": 26
          ],
          [
            "code_point": 115,
            "char": "s",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 116,
            "char": "t",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 117,
            "char": "u",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 118,
            "char": "v",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 119,
            "char": "w",
            "width": 7,
            "height": 26
          ],
          [
            "code_point": 120,
            "char": "x",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 121,
            "char": "y",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 122,
            "char": "z",
            "width": 5,
            "height": 26
          ],
          [
            "code_point": 48,
            "char": "0",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 49,
            "char": "1",
            "width": 2,
            "height": 26
          ],
          [
            "code_point": 50,
            "char": "2",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 51,
            "char": "3",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 52,
            "char": "4",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 53,
            "char": "5",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 54,
            "char": "6",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 55,
            "char": "7",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 56,
            "char": "8",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 57,
            "char": "9",
            "width": 6,
            "height": 26
          ],
          [
            "code_point": 46,
            "char": ".",
            "width": 1,
            "height": 26
          ],
          [
            "code_point": 45,
            "char": "-",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 58,
            "char": ":",
            "width": 1,
            "height": 26
          ],
//          [
//            "code_point": 8230,
//            "char": "\u2026",
//            "width": 5,
//            "height": 26
//          ],
//          [
//            "code_point": 8226,
//            "char": "\u2022",
//            "width": 2,
//            "height": 26
//          ],
          [
            "code_point": 42,
            "char": "*",
            "width": 4,
            "height": 26
          ],
          [
            "code_point": 35,
            "char": "#",
            "width": 4,
            "height": 26
          ],
          [
            "code_point": 47,
            "char": "/",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 92,
            "char": "\\",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 45,
            "char": "-",
            "width": 3,
            "height": 26
          ],
//          [
//            "code_point": 8211,
//            "char": "\u2013",
//            "width": 6,
//            "height": 26
//          ],
//          [
//            "code_point": 8212,
//            "char": "\u2014",
//            "width": 9,
//            "height": 26
//          ],
          [
            "code_point": 95,
            "char": "_",
            "width": 4,
            "height": 26
          ],
          [
            "code_point": 40,
            "char": "(",
            "width": 2,
            "height": 26
          ],
          [
            "code_point": 41,
            "char": ")",
            "width": 2,
            "height": 26
          ],
          [
            "code_point": 123,
            "char": "[",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 125,
            "char": "]",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 91,
            "char": "[",
            "width": 2,
            "height": 26
          ],
          [
            "code_point": 93,
            "char": "]",
            "width": 2,
            "height": 26
          ],
//          [
//            "code_point": 8220,
//            "char": "\u201c",
//            "width": 3,
//            "height": 26
//          ],
//          [
//            "code_point": 8221,
//            "char": "\u201d",
//            "width": 3,
//            "height": 26
//          ],
//          [
//            "code_point": 8216,
//            "char": "\u2018",
//            "width": 1,
//            "height": 26
//          ],
//          [
//            "code_point": 8217,
//            "char": "\u2019",
//            "width": 1,
//            "height": 26
//          ],
          [
            "code_point": 34,
            "char": "\"",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 39,
            "char": "'",
            "width": 1,
            "height": 26
          ],
          [
            "code_point": 43,
            "char": "+",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 62,
            "char": ">",
            "width": 3,
            "height": 26
          ],
          [
            "code_point": 60,
            "char": "<",
            "width": 3,
            "height": 26
          ],
//          [
//            "code_point": 8722,
//            "char": "\u2212",
//            "width": 3,
//            "height": 26
//          ],
          [
            "code_point": 44,
            "char": ",",
            "width": 1,
            "height": 26
          ]
        ]
        
        // Map characters directly to FontGlyph objects
        for glyph in hardcodedGlyphs {
            guard let codePoint = glyph["code_point"] as? Int,
                  let width = glyph["width"] as? Int,
                  let height = glyph["height"] as? Int else {
                continue
            }
            
            let character = Character(UnicodeScalar(codePoint)!)
            fontMap[character] = FontGlyph(width: width, height: height)
        }
        
        print("Hardcoded font data loaded successfully! \(fontMap.count) glyphs mapped.")
    }
    
    func getGlyph(_ character: Character) -> FontGlyph {
        return fontMap[character] ?? FontGlyph(width: 6, height: 26) // Default width=6, height=26
    }
    
    struct FontGlyph {
        let width: Int
        let height: Int
        
        init(width: Int, height: Int) {
            self.width = width
            self.height = height
        }
    }
}
