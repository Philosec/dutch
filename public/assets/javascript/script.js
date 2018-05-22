$(document).ready(function () {
    $('html, body').animate({
        scrollTop: 0
    })
    $('[data-toggle="tooltip"]').tooltip()
})


// Render Receipt Image, Prepare Data For OCR
//-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-//
let file = null

function renderImg() {
    file = $("input:file")[0].files[0]

    let reader = new FileReader()
    reader.onloadend = function () {
        $('.img-preview').attr('src', reader.result)
    }

    if (file) {
        $('.file-input-label a').html(`<i class="fas fa-image fa-lg"></i> ${file.name}`)
        reader.readAsDataURL(file)
        $('.img-wrapper')
            .animate({
                height: '530px'
            }, function () {
                $('.img-preview').fadeIn()
            })
    }
}

// Process OCR Receipt Image
//-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-//
$('.analyze-btn').on('click', function (event) {
    event.preventDefault()

    $('.progress-bar')
        .animate({
            width: '100%'
        }, function () {
            $('html, body').animate({
                scrollTop: ($('.item-container').offset().top) - 74
            }, 1000)
        })

    let formData = new FormData()

    formData.append("file", file)
    formData.append("language", "eng")
    formData.append("apikey", "302d46a6e388957")
    formData.append("isOverlayRequired", true)

    $.ajax({
        url: 'https://api.ocr.space/parse/image',
        data: formData,
        dataType: 'json',
        cache: false,
        contentType: false,
        processData: false,
        type: 'POST',
        success: function (ocrParsedResult) {
            let parsedResults = ocrParsedResult["ParsedResults"]
            let ocrExitCode = ocrParsedResult["OCRExitCode"]
            let isErroredOnProcessing = ocrParsedResult["IsErroredOnProcessing"]
            let errorMessage = ocrParsedResult["ErrorMessage"]
            let errorDetails = ocrParsedResult["ErrorDetails"]
            let processingInMilliseconds = ocrParsedResult["ProcessingInMilliseconds"]
            if (parsedResults != null) {
                $.each(parsedResults, function (index, value) {
                    let exitCode = value["FileParseExitCode"]
                    let parsedText = value["ParsedText"]
                    let errorMessage = value["ParsedTextFileName"]
                    let errorDetails = value["ErrorDetails"]
                    let textOverlay = value["TextOverlay"]
                    let pageText = '';
                    switch (+exitCode) {
                        case 1:
                            pageText = parsedText
                            break
                        case 0:
                        case -10:
                        case -20:
                        case -30:
                        case -99:
                        default:
                            pageText += "Error: " + errorMessage
                            break
                    }

                    let arr = []

                    $.each(textOverlay["Lines"], function (index, value) {

                        let text = ''

                        for (let i in value.Words)
                            text += ` ${value.Words[i].WordText}`

                        let obj = {
                            index: index,
                            text: text.trim(),
                            top: value.MinTop,
                            left: value.Words[0].Left,
                            lineHeight: value.MaxHeight
                        }
                        arr.push(obj)
                    })

                    let receipt = {
                        location: null,
                        date: null,
                        items: [],
                        tax: 0,
                        tip: 0,
                        total: 0,
                        reconciled: false,
                        image: null
                    }
                    let amounts = []
                    let descriptions = []
                    let items = []

                    arr
                        .sort(function (a, b) {
                            return a.top - b.top
                        })

                    function cleanFloat(string) {
                        string = string
                            .replace(/ /g, '')
                            .replace(/I/g, '1')
                            .replace(/\,/g, '.')
                            .replace(/\$/g, '')

                        return parseFloat(string)
                    }

                    arr.forEach(item =>
                        item.text.replace(/[^0-9]/g, '').length > 1 &&
                        (item.text.indexOf('.') !== -1 || item.text.indexOf(',') !== -1) &&
                        !(isNaN(cleanFloat(item.text))) &&
                        item.text.indexOf('/') === -1 ?
                        amounts.push(item) : descriptions.push(item))

                    amounts.forEach(item => item.text = cleanFloat(item.text))

                    for (let i in amounts) {
                        for (let j in descriptions) {
                            if (Math.abs(descriptions[j].top - amounts[i].top) < amounts[i].lineHeight / 2) {

                                let taxKeywords = new RegExp('(tax|%|gst)', 'g')
                                let totalKeywords = new RegExp('(sub|total|subtotal|balance|due)', 'g')
                                let ignoreKeywords = new RegExp('(cash|change|payment)', 'g')

                                let obj = {
                                    name: descriptions[j].text,
                                    amount: amounts[i].text,
                                    quantity: 1,
                                    isTax: taxKeywords.test(descriptions[j].text.toLowerCase()),
                                    isTotal: totalKeywords.test(descriptions[j].text.toLowerCase())
                                }
                                if (!ignoreKeywords.test(descriptions[j].text.toLowerCase()))
                                    items.push(obj)
                            }
                        }
                    }
                    items.forEach(item => item.isTotal ? receipt.total = item.amount :
                        item.isTax ? receipt.tax = item.amount :
                        !item.isTotal && !item.isTax ? receipt.items.push(item) :
                        false
                    )

                    if (Object.keys(receipt.items).reduce(function (previous, key) {
                            return previous + receipt.items[key].amount
                        }, 0) + receipt.tax === receipt.total)
                        receipt.reconciled = true

                    receipt.location = arr[0].text
                    descriptions.forEach(item => item.text.indexOf('/') !== -1 ?
                        item.text.split('/').length === 3 ?
                        receipt.date = item.text :
                        false :
                        false
                    )

                    console.log(formData, receipt) //send obj, create hbs string
                    loadResults(receipt)

                    if (receipt.reconciled)
                        $('#total-amount').removeClass('is-invalid').addClass('is-valid')

                })
            }
        }
    })
})
//Add Items to OCR Results
//-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-//
let itemCount = 1
let itemCountArr = []

$('.add-item').on('click', function (event) {
    event.preventDefault()

    appendNewItem()
})

function loadResults(data) {
    if (data.location)
        $('#location').val(data.location)

    if (data.date)
        $('#date').val(data.date)

    if (data.tax)
        $('#tax-amount').val(data.tax)

    if (data.total)
        $('#total-amount').val(data.total)

    data.items.forEach(item => appendNewItem(item.name, item.quantity, parseFloat(item.amount).toFixed(2)))
}

function appendNewItem(name, quantity, amount) {

    let aTwo = $('<button>')
        .attr('type', 'button')
        .addClass('dropdown-item select-dropdown-user')
        .text('User 1')

    let divider = $('<div>')
        .addClass('dropdown-divider')

    let aOne = $('<button>')
        .attr('type', 'button')
        .addClass('dropdown-item select-dropdown-user')
        .text('All Group Members')

    let dropDiv = $('<div>')
        .addClass('dropdown-menu user-dropdown w-100')
        .append(aOne, divider, aTwo)

    let dropBtn = $('<button>')
        .attr({
            type: 'button',
            'data-toggle': 'dropdown',
            'aria-haspopup': 'true',
            'aria-expanded': 'false'
        })
        .addClass('btn btn-outline-secondary dropdown-toggle btn-block')
        .html('<i class="fas fa-user"></i> Select Group Member')


    // let inputThree = $('<select>')
    //     .attr({
    //         id: `item-user-${itemCount}`
    //     })
    //     .addClass('form-control item-user-select rounded-right')
    //     .append(optionOne, optionTwo)

    // let groupTextThree = $('<div>')
    //     .addClass('input-group-text')
    //     .html('<i class="fas fa-user"></i>')

    // let prependThree = $('<div>')
    //     .addClass('input-group-prepend')
    //     .append(groupTextThree)

    let btnGroup = $('<div>')
        .addClass('btn-group btn-block')
        .append(dropBtn, dropDiv)
    // .append(prependThree)

    let inputGroupThree = $('<div>')
        .addClass('input-group')
        .append(btnGroup)


    let formGroupThree = $('<div>')
        .addClass('form-group col-md-6')
        .append(inputGroupThree)

    let invalidDiv = $('<div>')
        .addClass('invalid-feedback')
        .text('Please enter a valid number!')

    let inputTwo = $('<input>')
        .attr({
            type: 'text',
            id: `item-amount-${itemCount}`,
            'data-id': itemCount,
            placeholder: '0.00'
        })
        .addClass('form-control item-amount-input format-float text-right rounded-right')

    let groupTextTwo = $('<div>')
        .addClass('input-group-text')
        .text('$')

    let prependTwo = $('<div>')
        .addClass('input-group-prepend')
        .append(groupTextTwo)

    let inputGroupTwo = $('<div>')
        .addClass('input-group')
        .append(prependTwo, inputTwo, invalidDiv)

    let formGroupTwo = $('<div>')
        .addClass('form-group col-md-3 col-6 mb-3 mb-md-0')
        .append(inputGroupTwo)

    let inputOne = $('<input>')
        .attr({
            type: 'text',
            id: `item-quantity-${itemCount}`,
            placeholder: '1'
        })
        .addClass('form-control text-right item-quantity')

    let groupTextOne = $('<div>')
        .addClass('input-group-text')
        .text('#')

    let prependOne = $('<div>')
        .addClass('input-group-prepend')
        .append(groupTextOne)

    let inputGroupOne = $('<div>')
        .addClass('input-group')
        .append(prependOne, inputOne)

    let formGroupOne = $('<div>')
        .addClass('form-group col-md-3 col-6 mb-3 mb-md-0')
        .append(inputGroupOne)

    let row = $('<div>')
        .addClass('form-row')
        .append(formGroupOne, formGroupTwo, formGroupThree)

    let buttonName = $('<button>')
        .attr({
            type: 'button',
            'data-id': itemCount,
        })
        .addClass('btn btn-outline-secondary remove-item-btn btn-block')
        .html('<i class="fas fa-times"></i>')

    let appendName = $('<div>')
        .addClass('input-group-append')
        .append(buttonName)

    let inputName = $('<input>')
        .attr({
            type: 'text',
            id: `item-name-${itemCount}`,
            placeholder: 'Enter Item Name...'
        })
        .addClass('form-control item-name')

    let groupTextName = $('<div>')
        .addClass('input-group-text')
        .text(itemCount)

    let prependName = $('<div>')
        .addClass('input-group-prepend')
        .append(groupTextName)

    let inputGroupName = $('<div>')
        .addClass('input-group')
        .append(prependName, inputName, appendName)

    let formGroupName = $('<div>')
        .addClass('form-group col-12 mb-3')
        .append(inputGroupName)

    let nameRow = $('<div>')
        .addClass('form-row')
        .append(formGroupName)

    let userWrapper = $('<div>')
        .addClass('user-wrapper')

    let td = $('<td>')
        .append(nameRow, row, userWrapper)

    let tr = $('<tr>')
        .addClass('item-wrapper')
        .append(td)

    if (name)
        inputName.val(name)

    if (quantity)
        inputOne.val(quantity)

    if (amount)
        inputTwo.val(amount)

    $('.items-form-block').append(tr)

    itemCountArr.push(parseInt(itemCount))
    itemCount++
}

$(document).on('click', '.remove-item-btn ', function () {
    itemCountArr.splice(itemCountArr.indexOf(parseInt($(this)[0].dataset.id)), 1)
    $(this).closest('.item-wrapper').remove()
})

let globalOption = 'allocate'

$('.split-allocate-btn').on('click', function (event) { //here
    event.preventDefault()

    if (globalOption === $(this)[0].dataset.id)
        return

    globalOption = $(this)[0].dataset.id

    $('.split-allocate-btn')
        .addClass('btn-outline-secondary')
        .removeClass('btn-secondary')

    $(this)
        .removeClass('btn-outline-secondary')
        .addClass('btn-secondary')

})

$('.save-receipt-btn').on('click', function (event) { //here, also add validation, send object to server, route to user page, call user data, load friends, >receipts who's assigned, who's paid, circle w/ tooltips, pull items, >items & who you owe/paid, status - pending, complete, >activity
    event.preventDefault()

    let invalidInput = checkTaxTip()
})

function checkTaxTip() {

    let invalidInput = false

    let tax = parseFloat($('#tax-amount').val().trim()).toFixed(2)
    let tip = parseFloat($('#tip-amount').val().trim()).toFixed(2)

    if (tax === '' || isNaN(tax)) {
        $('#tax-amount').addClass('is-invalid rounded-right').removeClass('is-valid')
        invalidInput = true
    } else {
        $('#tax-amount').removeClass('is-invalid').addClass('is-valid')
        $('#tax-amount').val(tax)
    }

    if (tip === '' || isNaN(tip)) {
        $('#tip-amount').addClass('is-invalid rounded-right').removeClass('is-valid')
        invalidInput = true
    } else {
        $('#tip-amount').removeClass('is-invalid').addClass('is-valid')
        $('#tip-amount').val(tip)
    }

    return invalidInput
}

$('.clickable-member-badge').on('click', function () {

    let text = $('.add-member-input').val().trim()

    if (text === '') {
        $('.add-member-input')
            .focus()
            .select()
        return
    }

    let div = makeGroupMember(text, 'group-level')

    $('.group-members').append(div)

    let dropBtn = $('<button>')
        .attr('type', 'button')
        .addClass('dropdown-item select-dropdown-user')
        .text(text)

    $('.user-dropdown').append(dropBtn)

    $('.add-member-input').val('')
})

function makeGroupMember(text, type) {

    let input = $('<input>')
        .attr('type', 'text')
        .addClass('rounded-left form-control assigned-member-allocation text-right')
        .val('100%')

    let groupText = $('<div>')
        .addClass('input-group-text')
        .html('<i class="fas fa-percentage"></i>')

    let prepend = $('<div>')
        .addClass('input-group-prepend')
        .append(groupText)

    let button = $('<button>')
        .attr('type', 'button')
        .addClass(`btn btn-outline-secondary remove-group-member ${type}`)
        .html(`<i class="fas fa-times remove-group-member ${type}"></i>`)

    let appendDiv = $('<div>')
        .addClass('input-group-append')
        .append(button)

    let inputGroup = $('<div>')
        .addClass('input-group margin-top-center')
        .append(prepend, input, appendDiv)

    let groupTwo = $('<div>')
        .addClass('form-group col-8 col-md-6')
        .append(inputGroup)

    let img = $('<img>')
        .attr({
            'src': 'http://via.placeholder.com/60x60',
            'alt': ''
        })
        .addClass(`rounded-circle mr-4 assigned-member-badge remove-group-member ${type}`)

    if (text === 'All Group Members') {
        img
            .attr({
                'src': '',
                'alt': ''
            })
            .addClass('placeholder-hidden fas fa-users all-member-badge')
            .removeClass('rounded-circle')
    }

    let textSpan = $('<span>')
        .text(text)

    let span = $('<span>')
        .addClass('clickable btn')
        .append(img, textSpan)

    let group = $('<div>')
        .addClass('form-group col-6')
        .append(span)

    let textId = text.toLowerCase().split(' ').join('-')

    let div = $('<div>')
        .attr({
            'data-id': `user-${textId}`,
            id: `user-${textId}`
        })
        .addClass(`form-row current-user-member-badge assigned-member-row mt-2`)
        .append(group)

    if (type === 'item-level') {
        textSpan.addClass('d-none d-md-inline')
        group.removeClass('col-6').addClass('col-4 col-md-6')
        div.append(groupTwo)
    }

    return div
}

$(document).on('click', '.remove-group-member', function () {

    if ($(this).hasClass('item-level')) {
        let allocatedUserCount = $(this).closest('td').find('.user-wrapper').find('.assigned-member-allocation').get().map(element => element)
        $(this).closest('td').find('.user-wrapper').find('.assigned-member-allocation').val(`${parseFloat(100/(allocatedUserCount.length-1)).toFixed(0)}%`)
    }
    $(this).closest('.current-user-member-badge').remove()
})

$('.recalculate-total-btn').on('click', function () {

    // let invalidInput = false

    // for (let i = 0; i < itemCountArr.length; i++) {
    //     if(isNaN(parseFloat($(`#item-amount-${itemCountArr[i]}`).val().trim()))) {
    //         invalidInput = true
    //         $(`#item-amount-${itemCountArr[i]}`).addClass('is-invalid rounded-right')
    //     } else {
    //         $(`#item-amount-${itemCountArr[i]}`).removeClass('is-invalid rounded-right')
    //     }
    // }

    let invalidInput = checkTaxTip()

    if (invalidInput)
        return

    let itemAmounts = []

    for (let i = 0; i < itemCountArr.length; i++) {
        let value = parseFloat($(`#item-amount-${itemCountArr[i]}`).val().trim()).toFixed(2)
        itemAmounts.push(parseFloat(value))
        $(`#item-amount-${itemCountArr[i]}`).val(value)
    }

    itemAmounts.push(parseFloat($('#tax-amount').val().trim()), parseFloat($('#tip-amount').val().trim()))

    $('#total-amount').val(itemAmounts.reduce(function (acc, val) {
        return acc + val
    }))
})

$(document).on('click', '.select-dropdown-user', function (event) {
    event.preventDefault()

    if ($(this).text() === 'All Group Members') {
        $(this).closest('td').find('.user-wrapper').children().remove()
    } else {
        $(this).closest('td').find('.user-wrapper').children('#user-all-group-members').remove()
    }

    let div = makeGroupMember($(this).text(), 'item-level')

    $(this).closest('td').find('.user-wrapper').append(div)

    let currentItemUsers = $(this).closest('td').find('.user-wrapper').children().get().map(element => element)

    // if (currentItemUsers.includes('user-all-group-members'))
    //     $(this).closest('td').find('.user-wrapper').children('#user-all-group-members').remove()

    let allocatedUserCount = $(this).closest('td').find('.user-wrapper').find('.assigned-member-allocation').get().map(element => element)

    $(this).closest('td').find('.user-wrapper').find('.assigned-member-allocation').val(`${parseFloat(100/allocatedUserCount.length).toFixed(0)}%`)

    console.log(currentItemUsers, allocatedUserCount)

    //determine percentages

    //     if (text === 'All Group Members')
    //     $('.assigned-member-row').remove()

    // $('.assigned-member-row').get().map(element => console.log(element))


})

let holdingSrc = ''

$(document).on('mouseenter', '.assigned-member-badge', function () {

    holdingSrc = $(this).attr('src')

    $(this)
        .attr({
            'src': '',
            'alt': ''
        })
        .css({
            'border': '#ff5252'
        })
        .addClass('placeholder-hidden fas fa-times-circle text-red remove-member-badge')
})

$(document).on('mouseleave', '.assigned-member-badge', function () {
    $(this)
        .attr('src', holdingSrc)
        .css({
            'border': '#B4AEAC'
        })
        .removeClass('placeholder-hidden fas fa-times-circle text-red remove-member-badge')
})